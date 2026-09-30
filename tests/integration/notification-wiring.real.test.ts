/**
 * tests/integration/notification-wiring.real.test.ts — WP-L03 subscriber wiring.
 *
 * The unit tests drive `fanoutForRecipient` with stub sinks and the fail-loud
 * test calls the providers directly. This proves the wiring between them: a
 * domain event emitted on the bus reaches the registered notification
 * subscriber, which (in production mode, with no provider configured for the
 * org) writes the in-app notification, ledgers a FAILED email and SMS attempt,
 * audits each channel outcome and emits comms.delivery_failed per failed
 * channel. Inactive members and other orgs receive nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { auditLog, memberships, messageDeliveries, notifications, notificationSubscriptions, organizations, users } from '../../server/db/schema'
import { __resetEventBusForTests, emit, on } from '../../shared/events/bus'
import { commsDeliveryFailed, quoteSent } from '../../shared/events/catalog'
import { registerNotificationSubscriber } from '../../server/services/_subscribers/notification-subscriber'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('notification subscriber wiring (WP-L03)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const orgIds: string[] = []
  const userIds: string[] = []
  let orgId: string
  let otherOrgId: string
  let activeUser: string
  let inactiveMember: string
  let otherOrgUser: string
  const failures: Array<{ channel: string, sourceEventType: string | null, entityId: string }> = []
  const previous = { nodeEnv: process.env.NODE_ENV, disabled: process.env.BULWARK_NOTIFICATIONS_DISABLED }

  const mkUser = async (label: string) => {
    const [u] = await getDb().insert(users).values({ email: `l03-${label}-${stamp}@x.test`, fullName: label, passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userIds.push(u!.id)
    return u!.id
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'production'
    process.env.BULWARK_NOTIFICATIONS_DISABLED = '0'
    const db = getDb()
    const [o1] = await db.insert(organizations).values({ name: 'L03 wiring', slug: `l03-wiring-${stamp}` }).returning()
    const [o2] = await db.insert(organizations).values({ name: 'L03 other', slug: `l03-other-${stamp}` }).returning()
    orgId = o1!.id
    otherOrgId = o2!.id
    orgIds.push(orgId, otherOrgId)
    activeUser = await mkUser('active')
    inactiveMember = await mkUser('inactive')
    otherOrgUser = await mkUser('other')
    await db.insert(memberships).values([
      { userId: activeUser, organizationId: orgId, role: 'org_admin' },
      { userId: inactiveMember, organizationId: orgId, role: 'org_admin', isActive: false },
      { userId: otherOrgUser, organizationId: otherOrgId, role: 'org_admin' },
    ] as never)
    await db.insert(notificationSubscriptions).values({
      organizationId: orgId, userId: activeUser, eventType: 'quote.sent', channels: { inApp: true, email: true, sms: true },
    } as never)

    __resetEventBusForTests()
    registerNotificationSubscriber()
    on(commsDeliveryFailed, (p) => { failures.push({ channel: p.channel, sourceEventType: p.sourceEventType, entityId: p.entityId }) })

    await emit(quoteSent, {
      organizationId: orgId,
      entityId: randomUUID(),
      actorUserId: null,
      timestamp: new Date().toISOString(),
      propertyId: randomUUID(),
      quoteNumber: 'Q-L03-1',
    })
  })

  afterAll(async () => {
    const db = getDb()
    __resetEventBusForTests()
    await db.delete(auditLog).where(inArray(auditLog.organizationId, orgIds))
    await db.delete(messageDeliveries).where(inArray(messageDeliveries.organizationId, orgIds))
    await db.delete(notifications).where(inArray(notifications.organizationId, orgIds))
    await db.delete(notificationSubscriptions).where(inArray(notificationSubscriptions.organizationId, orgIds))
    await db.delete(memberships).where(inArray(memberships.organizationId, orgIds))
    await db.delete(users).where(inArray(users.id, userIds))
    await db.delete(organizations).where(inArray(organizations.id, orgIds))
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous.nodeEnv
    if (previous.disabled === undefined) delete process.env.BULWARK_NOTIFICATIONS_DISABLED
    else process.env.BULWARK_NOTIFICATIONS_DISABLED = previous.disabled
  })

  it('writes the in-app notification for the subscribed active member only', async () => {
    const rows = await getDb().select().from(notifications).where(inArray(notifications.organizationId, orgIds))
    expect(rows.map((r) => [r.userId, r.eventType])).toEqual([[activeUser, 'quote.sent']])
  })

  it('ledgers a failed email and SMS attempt (no provider configured in production)', async () => {
    const rows = await getDb().select().from(messageDeliveries).where(eq(messageDeliveries.organizationId, orgId))
    const byChannel = Object.fromEntries(rows.map((r) => [r.channel, r]))
    expect(Object.keys(byChannel).sort()).toEqual(['email', 'sms'])
    expect(byChannel.email!.status).toBe('failed')
    expect(byChannel.sms!.status).toBe('failed')
    for (const r of rows) {
      expect(r.eventType).toBe('quote.sent')
      expect(r.recipientHash).not.toContain('@') // HMAC, never the address
    }
    const other = await getDb().select().from(messageDeliveries).where(eq(messageDeliveries.organizationId, otherOrgId))
    expect(other).toEqual([])
  })

  it('audits each channel outcome and emits comms.delivery_failed per failed channel', async () => {
    const audits = await getDb().select().from(auditLog).where(and(
      eq(auditLog.organizationId, orgId),
      sql`${auditLog.metadata} ->> 'kind' = 'notification.dispatched'`,
    ))
    const outcomes = Object.fromEntries(audits.map((a) => [(a.metadata as { channel: string }).channel, (a.metadata as { outcome: string }).outcome]))
    expect(outcomes).toEqual({ inApp: 'ok', email: 'error', sms: 'error' })
    expect(failures.map((f) => f.channel).sort()).toEqual(['email', 'sms'])
    for (const f of failures) {
      expect(f.sourceEventType).toBe('quote.sent')
      expect(f.entityId).toBe(activeUser)
    }
  })
})

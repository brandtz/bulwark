/**
 * WP-L03 / gap register 3.2.3 — admin delivery health over the
 * message_deliveries ledger: counts, recent failures, window, and the
 * tenant + admin-role firewall.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb } from '../../server/db/client'
import { memberships, users } from '../../server/db/schema/users'
import { organizations } from '../../server/db/schema/organizations'
import { messageDeliveries } from '../../server/db/schema/message_deliveries'
import { RealCommsService } from '../../server/services/comms/comms.real'
import { ForbiddenError, TenantViolationError } from '../../server/services/_tenant'
import { DeliveryHealthOutputSchema } from '../../shared/contracts/delivery'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealCommsService.deliveryHealth', () => {
  const tag = randomUUID()
  let organizationId: string
  let otherOrganizationId: string
  let adminId: string
  let fieldId: string
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  beforeAll(async () => {
    const db = getDb()
    const [org, other] = await db.insert(organizations).values([
      { name: 'Comms Health Test', slug: `comms-health-${tag}` },
      { name: 'Comms Health Other', slug: `comms-health-other-${tag}` },
    ]).returning()
    organizationId = org!.id
    otherOrganizationId = other!.id
    const [admin, field] = await db.insert(users).values([
      { email: `comms-admin-${tag}@example.test`, fullName: 'Comms Admin' },
      { email: `comms-field-${tag}@example.test`, fullName: 'Comms Field' },
    ]).returning()
    adminId = admin!.id
    fieldId = field!.id
    await db.insert(memberships).values([
      { userId: adminId, organizationId, role: 'org_admin' },
      { userId: fieldId, organizationId, role: 'field' },
    ])
    const base = { channel: 'email', provider: 'resend', recipientHash: 'hash' }
    await db.insert(messageDeliveries).values([
      { ...base, organizationId, status: 'sent' },
      { ...base, organizationId, status: 'sent' },
      { ...base, organizationId, status: 'stubbed', provider: 'stub' },
      { ...base, organizationId, status: 'failed', error: 'HTTP 503', attempt: 3, eventType: 'quote.sent' },
      { ...base, organizationId, channel: 'sms', provider: 'none', status: 'failed', error: 'No active SMS provider is configured' },
      // Outside the window: must not be counted.
      { ...base, organizationId, status: 'failed', error: 'old', createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      // Another tenant: must never leak.
      { ...base, organizationId: otherOrganizationId, status: 'failed', error: 'other tenant' },
    ])
  })

  afterAll(async () => {
    if (!organizationId) return
    const db = getDb()
    const orgIds = [organizationId, otherOrganizationId]
    await db.delete(messageDeliveries).where(inArray(messageDeliveries.organizationId, orgIds))
    await db.delete(memberships).where(inArray(memberships.organizationId, orgIds))
    await db.delete(users).where(inArray(users.id, [adminId, fieldId]))
    await db.delete(organizations).where(inArray(organizations.id, orgIds))
  })

  it('summarizes the window for an org admin with recent failures first', async () => {
    const service = new RealCommsService(() => ({ userId: adminId, organizationId }))
    const health = await service.deliveryHealth({ organizationId, since })
    expect(health).toMatchObject({ sent: 2, stubbed: 1, failed: 2 })
    expect(health.byChannel).toEqual({
      email: { sent: 2, stubbed: 1, failed: 1 },
      sms: { sent: 0, stubbed: 0, failed: 1 },
    })
    expect(health.recentFailures).toHaveLength(2)
    expect(health.recentFailures.find((f) => f.channel === 'email')).toMatchObject({ error: 'HTTP 503', attempt: 3, eventType: 'quote.sent', organizationId })
    expect(health.recentFailures[0]).not.toHaveProperty('recipientHash')
    expect(DeliveryHealthOutputSchema.parse(health)).toEqual(health)
  })

  it('rejects a same-tenant member without an admin role', async () => {
    const service = new RealCommsService(() => ({ userId: fieldId, organizationId }))
    await expect(service.deliveryHealth({ organizationId, since })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('rejects an admin reading another organization', async () => {
    const service = new RealCommsService(() => ({ userId: adminId, organizationId }))
    await expect(service.deliveryHealth({ organizationId: otherOrganizationId, since }))
      .rejects.toBeInstanceOf(TenantViolationError)
  })

  it('rejects a malformed window', async () => {
    const service = new RealCommsService(() => ({ userId: adminId, organizationId }))
    await expect(service.deliveryHealth({ organizationId, since: 'yesterday' })).rejects.toThrow()
  })

  it('keeps the org row set isolated when queried directly', async () => {
    const rows = await getDb().select().from(messageDeliveries).where(eq(messageDeliveries.organizationId, organizationId))
    expect(rows.some((r) => r.error === 'other tenant')).toBe(false)
  })
})

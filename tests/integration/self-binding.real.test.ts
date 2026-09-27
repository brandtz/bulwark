/**
 * WP-L07 S7 — personal-data services act only on the signed-in user.
 * Found while auditing the RPC surface: MFA, account export/deletion,
 * notifications and saved views accepted any userId from the caller.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb } from '../../server/db/client'
import { memberships, users } from '../../server/db/schema/users'
import { organizations } from '../../server/db/schema/organizations'
import { savedViews } from '../../server/db/schema/saved_views'
import { userMfa } from '../../server/db/schema/user_mfa'
import { auditLog } from '../../server/db/schema/audit_log'
import { notificationSubscriptions } from '../../server/db/schema/notification_subscriptions'
import { RealMfaService } from '../../server/services/mfa.real'
import { RealAccountService } from '../../server/services/account.real'
import { RealNotificationService } from '../../server/services/notification.real'
import { RealNotificationSubscriptionService } from '../../server/services/notification-subscription.real'
import { RealSavedViewService } from '../../server/services/saved-view.real'
import { ForbiddenError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('self-bound personal data (WP-L07 S7)', () => {
  const tag = randomUUID().slice(0, 8)
  const id = { org: '', alice: '', bob: '', admin: '' }

  beforeAll(async () => {
    const db = getDb()
    const [org] = await db.insert(organizations).values({ name: 'Self Binding', slug: `self-${tag}` }).returning()
    id.org = org!.id
    const [a, b, adm] = await db.insert(users).values([
      { email: `self-alice-${tag}@example.test`, fullName: 'Alice' },
      { email: `self-bob-${tag}@example.test`, fullName: 'Bob' },
      { email: `self-admin-${tag}@example.test`, fullName: 'Admin' },
    ]).returning()
    ;[id.alice, id.bob, id.admin] = [a!.id, b!.id, adm!.id]
    await db.insert(memberships).values([
      { userId: id.alice, organizationId: id.org, role: 'field' },
      { userId: id.bob, organizationId: id.org, role: 'field' },
      { userId: id.admin, organizationId: id.org, role: 'org_admin' },
    ])
  })

  afterAll(async () => {
    if (!id.org) return
    const db = getDb()
    const people = [id.alice, id.bob, id.admin]
    await db.delete(savedViews).where(eq(savedViews.organizationId, id.org))
    await db.delete(notificationSubscriptions).where(eq(notificationSubscriptions.organizationId, id.org))
    await db.delete(auditLog).where(eq(auditLog.organizationId, id.org))
    await db.delete(userMfa).where(inArray(userMfa.userId, people))
    await db.delete(memberships).where(eq(memberships.organizationId, id.org))
    await db.delete(users).where(inArray(users.id, people))
    await db.delete(organizations).where(eq(organizations.id, id.org))
  })

  const as = (userId: string) => () => ({ userId, organizationId: id.org })

  it('MFA: cannot enrol, read or mint backup codes for another user', async () => {
    const mfa = new RealMfaService(as(id.alice))
    for (const call of [
      () => mfa.getStatus(id.bob),
      () => mfa.setupTotp(id.bob),
      () => mfa.confirmTotp(id.bob, '000000'),
      () => mfa.verifyTotp(id.bob, '000000'),
      () => mfa.disable(id.bob, '000000'),
      () => mfa.generateBackupCodes(id.bob),
      () => mfa.consumeBackupCode(id.bob, 'AAAA-BBBB'),
    ]) await expect(call()).rejects.toBeInstanceOf(ForbiddenError)
    await expect(mfa.getStatus(id.alice)).resolves.toMatchObject({ enabled: false })
    await expect(new RealMfaService(() => null).getStatus(id.alice)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('account: cannot export or delete another user, not even as an org admin', async () => {
    const account = new RealAccountService(as(id.admin))
    await expect(account.exportPersonalData(id.bob)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(account.requestDeletion({ userId: id.bob } as Parameters<typeof account.requestDeletion>[0])).rejects.toBeInstanceOf(ForbiddenError)
    await expect(new RealAccountService(as(id.bob)).exportPersonalData(id.bob)).resolves.toBeDefined()
  })

  it('notifications: cannot read or clear another user\'s feed', async () => {
    const notes = new RealNotificationService(as(id.alice))
    await expect(notes.listForUser(id.bob)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(notes.unreadCountForUser(id.bob)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(notes.markAllRead(id.bob)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(notes.unreadCountForUser(id.alice)).resolves.toBe(0)
  })

  it('subscriptions: members manage only their own; admins may manage others', async () => {
    const input = { organizationId: id.org, userId: id.bob, eventType: 'quote.sent', channels: ['in_app'] } as Parameters<RealNotificationSubscriptionService['upsert']>[0]
    await expect(new RealNotificationSubscriptionService(as(id.alice)).upsert(input)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(new RealNotificationSubscriptionService(as(id.alice)).listForUser(id.org, id.bob)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(new RealNotificationSubscriptionService(as(id.admin)).listForUser(id.org, id.bob)).resolves.toBeDefined()
  })

  it('saved views: personal views belong to their owner', async () => {
    const views = new RealSavedViewService(as(id.alice))
    const base = { organizationId: id.org, entityType: 'property', name: 'Mine', filters: {} } as const
    await expect(views.create({ ...base, userId: id.bob } as Parameters<typeof views.create>[0])).rejects.toBeInstanceOf(ForbiddenError)
    const bobs = await new RealSavedViewService(as(id.bob)).create({ ...base, userId: id.bob } as Parameters<typeof views.create>[0])
    await expect(views.update({ id: bobs.id, organizationId: id.org, name: 'Hijacked' } as Parameters<typeof views.update>[0])).rejects.toBeInstanceOf(ForbiddenError)
    await expect(views.setDefault(bobs.id, id.org)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(views.softDelete(bobs.id, id.org)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(new RealSavedViewService(as(id.bob)).update({ id: bobs.id, organizationId: id.org, name: 'Renamed' } as Parameters<typeof views.update>[0]))
      .resolves.toMatchObject({ name: 'Renamed' })
  })
})

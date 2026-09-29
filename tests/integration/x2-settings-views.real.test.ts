/**
 * tests/integration/x2-settings-views.real.test.ts — WP-X2 columns:
 * org_settings.ui_history_days (ED-000, 30–365 inclusive) and
 * saved_views.layout_json (ED-013) round-trips, on the real services.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { auditLog, memberships, organizations, orgSettings, savedViews, users } from '../../server/db/schema'
import { RealOrgSettingsService } from '../../server/services/org-settings.real'
import { RealSavedViewService } from '../../server/services/saved-view.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('WP-X2 settings + saved-view columns', () => {
  let orgId: string
  let userId: string

  beforeAll(async () => {
    const db = getDb()
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const [o] = await db.insert(organizations).values({ name: 'X2 cols', slug: `x2-cols-${stamp}` }).returning()
    orgId = o!.id
    const [u] = await db.insert(users).values({ email: `x2-cols-${stamp}@x.test`, fullName: 'T', passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userId = u!.id
    await db.insert(memberships).values({ userId, organizationId: orgId, role: 'org_admin' })
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(savedViews).where(eq(savedViews.organizationId, orgId))
    await db.delete(orgSettings).where(eq(orgSettings.organizationId, orgId))
    await db.delete(memberships).where(eq(memberships.organizationId, orgId))
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  const ctx = () => ({ organizationId: orgId, userId })

  it('uiHistoryDays accepts 30 and 365 and refuses 29 and 366', async () => {
    const svc = new RealOrgSettingsService(ctx)
    expect((await svc.get(orgId)).uiHistoryDays).toBe(90)
    expect((await svc.update({ organizationId: orgId, uiHistoryDays: 30 })).uiHistoryDays).toBe(30)
    expect((await svc.update({ organizationId: orgId, uiHistoryDays: 365 })).uiHistoryDays).toBe(365)
    await expect(svc.update({ organizationId: orgId, uiHistoryDays: 29 })).rejects.toThrow(/30-365/u)
    await expect(svc.update({ organizationId: orgId, uiHistoryDays: 366 })).rejects.toThrow(/30-365/u)
    expect((await svc.get(orgId)).uiHistoryDays).toBe(365)
  })

  it('saved-view layout round-trips, updates and clears to the default', async () => {
    const svc = new RealSavedViewService(ctx)
    const layout = { columns: [{ key: 'address', visible: true }, { key: 'status', visible: false }] }
    const v = await svc.create({ organizationId: orgId, userId, entityType: 'property', name: 'Mine', filters: {}, layout })
    expect(v.layout).toEqual(layout)
    const next = { columns: [{ key: 'status', visible: true }, { key: 'address', visible: true }] }
    expect((await svc.update({ id: v.id, organizationId: orgId, layout: next })).layout).toEqual(next)
    expect((await svc.update({ id: v.id, organizationId: orgId, layout: null })).layout).toBeNull()
  })
})

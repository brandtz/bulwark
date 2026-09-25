import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb } from '../../server/db/client'
import { users } from '../../server/db/schema/users'
import { userPrefs } from '../../server/db/schema/user_prefs'
import { organizations } from '../../server/db/schema/organizations'
import { orgBranding } from '../../server/db/schema/org_branding'
import { auditLog } from '../../server/db/schema/audit_log'
import { RealThemePreferencesService } from '../../server/services/theme-preferences.real'
import { RealLabelService } from '../../server/services/label.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealThemePreferencesService', () => {
  const email = `theme-preferences-${randomUUID()}@example.test`
  const organizationSlug = `theme-preferences-${randomUUID()}`
  let organizationId: string
  let userId: string

  beforeAll(async () => {
    const db = getDb()
    const [organization] = await db.insert(organizations).values({ name: 'Theme Preference Test', slug: organizationSlug }).returning()
    organizationId = organization!.id
    const [user] = await db.insert(users).values({ email, fullName: 'Theme Preference Test' }).returning()
    userId = user!.id
  })

  afterAll(async () => {
    if (!userId) return
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, organizationId))
    await db.delete(userPrefs).where(eq(userPrefs.userId, userId))
    await db.delete(orgBranding).where(eq(orgBranding.organizationId, organizationId))
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(organizations).where(eq(organizations.id, organizationId))
  })

  it('stores user preferences and merges partial updates', async () => {
    const service = new RealThemePreferencesService(() => ({ userId, organizationId }))
    await expect(service.getCurrent()).resolves.toMatchObject({ theme: 'system', density: 'auto', saved: false })
    await service.updateCurrent({ theme: 'dark' })
    await service.updateCurrent({ density: 'touch' })
    await expect(service.getCurrent()).resolves.toMatchObject({ theme: 'dark', density: 'touch', saved: true })
  })

  it('persists a WCAG-compliant onAccent value with organization branding', async () => {
    const service = new RealLabelService(() => ({ userId, organizationId }))
    const light = await service.updateBranding({ organizationId, accentColor: '#F5D90A' })
    expect(light).toMatchObject({ accentColor: '#F5D90A', onAccent: '#161B22' })
    const stored = await service.getBranding(organizationId)
    expect(stored.onAccent).toBe('#161B22')
    const dark = await service.updateBranding({ organizationId, accentColor: '#0F766E' })
    expect(dark.onAccent).toBe('#FFFFFF')
  })
})
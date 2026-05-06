/**
 * tests/integration/api-key.real.test.ts — RealApiKeyService (E11-S12).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { apiKeys } from '../../server/db/schema/api_keys'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { RealApiKeyService } from '../../server/services/api-key.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealApiKeyService (E11-S12)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'K Org', slug: `e11k-${stamp}` }).returning()
    orgId = o!.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(apiKeys).where(eq(apiKeys.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  it('create() returns raw secret once, persists only the hash', async () => {
    const svc = new RealApiKeyService()
    const r = await svc.create({ organizationId: orgId, label: 'CI', createdById: null })
    expect(r.secret).toMatch(/^bw_sk_/)
    expect(r.row.prefix.length).toBeGreaterThanOrEqual(8)
    expect(r.row.label).toBe('CI')
    expect(r.row.revokedAt).toBeNull()
    // Verify hash-based check works.
    const matched = await svc.verifySecret(orgId, r.secret)
    expect(matched).toBe(r.row.id)
    const wrong = await svc.verifySecret(orgId, 'bw_sk_definitely_wrong_secret_value')
    expect(wrong).toBeNull()
  })

  it('list() returns rows; revoke() flips revokedAt and verifySecret stops matching', async () => {
    const svc = new RealApiKeyService()
    const r = await svc.create({ organizationId: orgId, label: 'rotate', createdById: null })
    const rows = await svc.list(orgId)
    expect(rows.some((k) => k.id === r.row.id)).toBe(true)
    const revoked = await svc.revoke(r.row.id, orgId)
    expect(revoked.revokedAt).not.toBeNull()
    const matched = await svc.verifySecret(orgId, r.secret)
    expect(matched).toBeNull()
  })
})

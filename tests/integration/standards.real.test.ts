/**
 * tests/integration/standards.real.test.ts — RealStandardsService.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { complianceStandards } from '../../server/db/schema/standards'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { OREGON_DEFAULT_STANDARDS } from '../../shared/utils/compliance'
import { RealStandardsService } from '../../server/services/standards.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealStandardsService (E11)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'Std Org', slug: `e11std-${stamp}` }).returning()
    orgId = o.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(complianceStandards).where(eq(complianceStandards.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  it('get() returns OREGON_DEFAULT_STANDARDS when no row exists', async () => {
    const svc = new RealStandardsService()
    const r = await svc.get(orgId)
    expect(r.standards).toEqual(OREGON_DEFAULT_STANDARDS)
    expect(r.updatedById).toBeNull()
  })

  it('save() upserts and re-read returns the patch', async () => {
    const svc = new RealStandardsService()
    const patched = { ...OREGON_DEFAULT_STANDARDS, requireDefensibleSpace: false }
    const r1 = await svc.save(orgId, patched, null)
    expect(r1.standards.requireDefensibleSpace).toBe(false)
    const r2 = await svc.get(orgId)
    expect(r2.standards.requireDefensibleSpace).toBe(false)
    // Second save updates the existing row (no duplicate PK).
    const r3 = await svc.save(orgId, OREGON_DEFAULT_STANDARDS, null)
    expect(r3.standards.requireDefensibleSpace).toBe(true)
  })
})

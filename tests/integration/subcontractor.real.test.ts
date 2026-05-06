/**
 * tests/integration/subcontractor.real.test.ts — RealSubcontractorService (E11-S8).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { subcontractors } from '../../server/db/schema/subcontractors'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { RealSubcontractorService } from '../../server/services/subcontractor.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealSubcontractorService (E11-S8)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string
  let otherOrgId: string
  let s1: string
  let s2: string

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'E11-S8 Sub Org', slug: `e11s8s-${stamp}` }).returning()
    const [o2] = await db.insert(organizations).values({ name: 'E11-S8 Other', slug: `e11s8so-${stamp}` }).returning()
    orgId = o!.id
    otherOrgId = o2!.id
    const [a] = await db.insert(subcontractors).values({
      organizationId: orgId, companyName: 'Roofers Inc', contactName: 'A', email: 'a@x.test', phone: '555-1', trades: ['roofing'], licenseNumber: null, licenseExpiresAt: null, notes: null,
    }).returning()
    const [b] = await db.insert(subcontractors).values({
      organizationId: orgId, companyName: 'Vent Pros', contactName: 'B', email: 'b@x.test', phone: '555-2', trades: ['eaves_vents', 'gutters'], licenseNumber: null, licenseExpiresAt: null, notes: null,
    }).returning()
    s1 = a!.id
    s2 = b!.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(subcontractors).where(eq(subcontractors.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await db.delete(organizations).where(eq(organizations.id, otherOrgId))
  })

  it('list() returns scoped rows and filters by trade', async () => {
    const svc = new RealSubcontractorService()
    const all = await svc.list({ organizationId: orgId, page: 1, pageSize: 100 })
    expect(all.total).toBeGreaterThanOrEqual(2)
    expect(all.rows.every((r) => r.organizationId === orgId)).toBe(true)
    const ventOnly = await svc.list({ organizationId: orgId, trade: 'eaves_vents', page: 1, pageSize: 100 })
    expect(ventOnly.rows.some((r) => r.id === s2)).toBe(true)
    expect(ventOnly.rows.every((r) => r.trades.includes('eaves_vents'))).toBe(true)
  })

  it('get() respects org scoping', async () => {
    const svc = new RealSubcontractorService()
    expect((await svc.get(s1, orgId))?.id).toBe(s1)
    expect(await svc.get(s1, otherOrgId)).toBeNull()
  })

  it('update() applies a patch and writes an audit row', async () => {
    const svc = new RealSubcontractorService()
    const updated = await svc.update(s1, { phone: '555-9999', trades: ['roofing', 'siding'] as const }, orgId)
    expect(updated.phone).toBe('555-9999')
    expect(updated.trades).toEqual(['roofing', 'siding'])
    const db = getDb()
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, s1))
    expect(rows.some((r) => r.action === 'update')).toBe(true)
  })

  it('tenant firewall throws on cross-tenant update', async () => {
    const resolver = () => ({ userId: 'u', organizationId: orgId })
    const svc = new RealSubcontractorService(resolver)
    await expect(svc.update(s1, { phone: 'x' }, otherOrgId)).rejects.toBeInstanceOf(TenantViolationError)
  })
})

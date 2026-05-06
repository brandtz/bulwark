/**
 * tests/integration/assessment.real.test.ts — RealAssessmentService (E11-S6).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { assessments } from '../../server/db/schema/assessments'
import { properties } from '../../server/db/schema/properties'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { users } from '../../server/db/schema/users'
import bcrypt from 'bcryptjs'
import { RealAssessmentService } from '../../server/services/assessment.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealAssessmentService (E11-S6)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string
  let userId: string
  let propertyId: string

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'E11-S6 Org', slug: `e11s6-${stamp}` }).returning()
    orgId = o.id
    const [u] = await db.insert(users).values({ email: `e11s6-${stamp}@x.test`, fullName: 'Test', passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userId = u.id
    const [p] = await db.insert(properties).values({ organizationId: orgId, addressLine1: 'P', city: 'C', state: 'CA', postalCode: '0' }).returning()
    propertyId = p.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(assessments).where(eq(assessments.organizationId, orgId))
    await db.delete(properties).where(eq(properties.organizationId, orgId))
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  const baseInput = () => ({
    organizationId: orgId,
    propertyId,
    assessedById: userId,
    assessedAt: new Date().toISOString(),
    roofMaterial: 'standard_asphalt' as const,
    sidingMaterial: 'wood' as const,
    eaveType: 'open' as const,
    ventType: 'unscreened' as const,
    defensibleSpaceCleared: false,
    notes: 'first pass',
  })

  it('create() inserts and returns a contract Assessment', async () => {
    const svc = new RealAssessmentService()
    const a = await svc.create(baseInput())
    expect(a.id).toMatch(/[0-9a-f-]{36}/)
    expect(a.roofMaterial).toBe('standard_asphalt')
    expect(typeof a.assessedAt).toBe('string')
  })

  it('getLatestForProperty() returns the most recent', async () => {
    const svc = new RealAssessmentService()
    const a1 = await svc.create({ ...baseInput(), assessedAt: new Date(Date.now() - 60000).toISOString() })
    const a2 = await svc.create({ ...baseInput(), assessedAt: new Date().toISOString(), roofMaterial: 'metal' })
    const latest = await svc.getLatestForProperty(propertyId, orgId)
    expect(latest?.id).not.toBe(a1.id)
    expect(latest?.id).toBe(a2.id)
    expect(latest?.roofMaterial).toBe('metal')
  })

  it('list() filters by propertyId and respects pagination', async () => {
    const svc = new RealAssessmentService()
    const r = await svc.list({ organizationId: orgId, propertyId, page: 1, pageSize: 100 })
    expect(r.total).toBeGreaterThanOrEqual(1)
    expect(r.rows.every((x) => x.propertyId === propertyId)).toBe(true)
  })

  it('audit row written on create', async () => {
    const svc = new RealAssessmentService()
    const a = await svc.create(baseInput())
    const db = getDb()
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, a.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].entityType).toBe('assessment')
    expect(rows[0].action).toBe('create')
  })

  it('tenant firewall blocks cross-tenant create', async () => {
    const resolver = () => ({ userId, organizationId: '00000000-0000-4000-8000-000000000aaa' })
    const svc = new RealAssessmentService(resolver)
    await expect(svc.create(baseInput())).rejects.toBeInstanceOf(TenantViolationError)
  })
})

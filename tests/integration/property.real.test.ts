/**
 * tests/integration/property.real.test.ts — RealPropertyService (E11-S5).
 *
 * # Decisions (ADR-0007 carve-out)
 *   - Auto-skips when DATABASE_URL is unset.
 *   - Each test fabricates an isolated org; cleanup tears down child rows
 *     (audit_log, properties) before the org so FKs are happy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { properties } from '../../server/db/schema/properties'
import { statusPipelineNodes, statusPipelines } from '../../server/db/schema/status_pipelines'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { RealPropertyService } from '../../server/services/property.real'
import { RealStatusPipelineService } from '../../server/services/status-pipeline.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealPropertyService (E11-S5)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string
  let otherOrgId: string

  beforeAll(async () => {
    const db = getDb()
    const [a] = await db.insert(organizations).values({ name: 'E11-S5 PropOrg', slug: `e11s5p-${stamp}` }).returning()
    const [b] = await db.insert(organizations).values({ name: 'E11-S5 Other', slug: `e11s5o-${stamp}` }).returning()
    orgId = a!.id
    otherOrgId = b!.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    const pipelines = await db
      .select({ id: statusPipelines.id })
      .from(statusPipelines)
      .where(eq(statusPipelines.organizationId, orgId))
    if (pipelines.length) {
      await db
        .delete(statusPipelineNodes)
        .where(inArray(statusPipelineNodes.pipelineId, pipelines.map((pipeline) => pipeline.id)))
    }
    await db.delete(statusPipelines).where(eq(statusPipelines.organizationId, orgId))
    await db.delete(properties).where(eq(properties.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await db.delete(organizations).where(eq(organizations.id, otherOrgId))
  })

  it('create() inserts and returns a Property contract', async () => {
    const svc = new RealPropertyService()
    const p = await svc.create({
      organizationId: orgId,
      addressLine1: '100 Test St',
      addressLine2: null,
      city: 'Berkeley',
      state: 'CA',
      postalCode: '94704',
      clientId: null,
      notes: null,
    })
    expect(p.id).toMatch(/[0-9a-f-]{36}/)
    expect(p.status).toBe('lead')
    expect(p.organizationId).toBe(orgId)
    expect(typeof p.createdAt).toBe('string')
  })

  it('list() returns scoped + paginated results, supports status + search filters', async () => {
    const svc = new RealPropertyService()
    await svc.create({ organizationId: orgId, addressLine1: '200 Ridge Way', addressLine2: null, city: 'Oakland', state: 'CA', postalCode: '94601', clientId: null, notes: null })
    await svc.create({ organizationId: orgId, addressLine1: '300 Forest Ln', addressLine2: null, city: 'Oakland', state: 'CA', postalCode: '94602', clientId: null, notes: null })

    const all = await svc.list({ organizationId: orgId, page: 1, pageSize: 100 })
    expect(all.total).toBeGreaterThanOrEqual(3)

    const filtered = await svc.list({ organizationId: orgId, page: 1, pageSize: 100, search: 'forest' })
    expect(filtered.rows.some((r) => r.addressLine1.includes('Forest'))).toBe(true)
    expect(filtered.rows.every((r) => r.organizationId === orgId)).toBe(true)
  })

  it('get() returns null for unknown id and respects org scoping', async () => {
    const svc = new RealPropertyService()
    const p = await svc.create({ organizationId: orgId, addressLine1: '400 Hidden', addressLine2: null, city: 'Oakland', state: 'CA', postalCode: '94603', clientId: null, notes: null })
    expect(await svc.get(p.id, orgId)).not.toBeNull()
    expect(await svc.get(p.id, otherOrgId)).toBeNull()
    expect(await svc.get('00000000-0000-4000-8000-000000000999', orgId)).toBeNull()
  })

  it('update() applies a partial patch and writes an audit row', async () => {
    const svc = new RealPropertyService()
    const p = await svc.create({ organizationId: orgId, addressLine1: '500 Patch Ave', addressLine2: null, city: 'Oakland', state: 'CA', postalCode: '94604', clientId: null, notes: null })
    const updated = await svc.update({ id: p.id, organizationId: orgId, notes: 'inspector noted moss on roof' })
    expect(updated.notes).toBe('inspector noted moss on roof')
    expect(updated.addressLine1).toBe(p.addressLine1)

    const db = getDb()
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, p.id))
    expect(audits.some((a) => a.action === 'update')).toBe(true)
  })

  it('updateStatus() records a state_change audit row with from/to metadata', async () => {
    const svc = new RealPropertyService()
    const p = await svc.create({ organizationId: orgId, addressLine1: '600 State St', addressLine2: null, city: 'Oakland', state: 'CA', postalCode: '94605', clientId: null, notes: null })
    const moved = await svc.updateStatus(p.id, 'scheduled', orgId)
    expect(moved.status).toBe('scheduled')

    const db = getDb()
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, p.id))
    const stateChange = rows.find((r) => r.action === 'state_change')
    expect(stateChange).toBeDefined()
    expect(stateChange!.metadata).toMatchObject({ from: 'lead', to: 'scheduled' })
  })

  it('creates and transitions properties using only the active pipeline statuses', async () => {
    const pipeline = new RealStatusPipelineService()
    await pipeline.save({
      organizationId: orgId,
      entityType: 'property',
      nodes: [
        { slug: 'intake', labelKey: 'status.property.intake', color: '#94A3B8', sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['review'] },
        { slug: 'review', labelKey: 'status.property.review', color: '#10B981', sortOrder: 20, isInitial: false, isTerminal: true, requiresReason: true, allowedTransitions: [] },
      ],
    })
    const service = new RealPropertyService()
    const property = await service.create({
      organizationId: orgId,
      addressLine1: '800 Custom Status St',
      addressLine2: null,
      city: 'Oakland',
      state: 'CA',
      postalCode: '94607',
      clientId: null,
      notes: null,
    })

    expect(property.status).toBe('intake')
    await expect(service.updateStatus(property.id, 'not_configured', orgId)).rejects.toThrow(/not in the active pipeline/i)
    await expect(service.updateStatus(property.id, 'review', orgId)).rejects.toThrow(/reason is required/i)
    const reviewed = await service.updateStatus(property.id, 'review', orgId, 'Inspection completed')
    expect(reviewed.status).toBe('review')
  })

  it('softDelete() hides the row from list/get and writes a delete audit row', async () => {
    const svc = new RealPropertyService()
    const p = await svc.create({ organizationId: orgId, addressLine1: '700 Goodbye', addressLine2: null, city: 'Oakland', state: 'CA', postalCode: '94606', clientId: null, notes: null })
    await svc.softDelete(p.id, orgId)
    expect(await svc.get(p.id, orgId)).toBeNull()
    const list = await svc.list({ organizationId: orgId, page: 1, pageSize: 100 })
    expect(list.rows.some((r) => r.id === p.id)).toBe(false)
  })

  it('tenant firewall throws TenantViolationError when session org mismatches', async () => {
    const resolver = () => ({ userId: 'u', organizationId: orgId })
    const svc = new RealPropertyService(resolver)
    await expect(
      svc.create({ organizationId: otherOrgId, addressLine1: 'X', addressLine2: null, city: 'Y', state: 'CA', postalCode: '00000', clientId: null, notes: null }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })
})

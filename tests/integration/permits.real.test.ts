/**
 * tests/integration/permits.real.test.ts — WP-X2 / ED-039 / ED-061: permits
 * against a per-tenant jurisdictions catalog, AD-19 fields/statuses/transitions,
 * jurisdiction inspections, and the tenant firewall.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { auditLog, jurisdictions, memberships, organizations, permitInspections, permits, properties, users } from '../../server/db/schema'
import { RealPermitService } from '../../server/services/permit.real'
import { TenantViolationError, type TenantContext } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealPermitService (WP-X2 / ED-039 / ED-061)', () => {
  const tag = randomUUID().slice(0, 8)
  const id = { org: '', other: '', user: '', prop: '' }
  let svc: RealPermitService

  beforeAll(async () => {
    const db = getDb()
    const [o, o2] = await db.insert(organizations).values([
      { name: 'X2 permits', slug: `x2-permits-${tag}` },
      { name: 'X2 permits other', slug: `x2-permits-o-${tag}` },
    ]).returning()
    ;[id.org, id.other] = [o!.id, o2!.id]
    const [u] = await db.insert(users).values({ email: `x2-permits-${tag}@example.test`, fullName: 'Admin', isActive: true }).returning()
    id.user = u!.id
    await db.insert(memberships).values({ userId: id.user, organizationId: id.org, role: 'org_admin' })
    const [p] = await db.insert(properties).values({ organizationId: id.org, addressLine1: '1 Permit Way', city: 'C', state: 'CA', postalCode: '0' }).returning()
    id.prop = p!.id
    const ctx: TenantContext = { userId: id.user, organizationId: id.org }
    svc = new RealPermitService(() => ctx)
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, id.org))
    await db.delete(permitInspections).where(eq(permitInspections.organizationId, id.org))
    await db.delete(permits).where(eq(permits.organizationId, id.org))
    await db.delete(jurisdictions).where(eq(jurisdictions.organizationId, id.org))
    await db.delete(properties).where(eq(properties.organizationId, id.org))
    await db.delete(memberships).where(eq(memberships.userId, id.user))
  })

  const base = () => ({ organizationId: id.org, propertyId: id.prop, kind: 'roofing', permitNumber: `R-${randomUUID().slice(0, 6)}`, scope: 'Reroof, class A', jurisdictionOther: 'Unincorporated' as string | null })
  const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString()

  it('creates a permit against a catalog jurisdiction and lists it', async () => {
    const j = await svc.upsertJurisdiction({ organizationId: id.org, name: 'City of Testville', code: 'TV' })
    const permit = await svc.create({ ...base(), jurisdictionOther: null, jurisdictionId: j.id })
    expect(permit.status).toBe('applied')
    expect(permit.scope).toBe('Reroof, class A')
    expect(permit.jurisdictionId).toBe(j.id)
    const list = await svc.list({ organizationId: id.org, propertyId: id.prop })
    expect(list.map((p) => p.id)).toContain(permit.id)
    expect((await svc.listJurisdictions(id.org)).map((x) => x.id)).toContain(j.id)
  })

  it('requires number, jurisdiction and scope; catalog and "Other" are exclusive', async () => {
    const j = await svc.upsertJurisdiction({ organizationId: id.org, name: 'County' })
    await expect(svc.create({ ...base(), jurisdictionId: j.id })).rejects.toThrow(/not both/u)
    await expect(svc.create({ ...base(), jurisdictionOther: null })).rejects.toThrow(/jurisdiction is required/u)
    await expect(svc.create({ ...base(), permitNumber: null })).rejects.toThrow(/permit number is required/u)
    await expect(svc.create({ ...base(), scope: null })).rejects.toThrow(/scope is required/u)
  })

  it('requires an issue date from issued on, and expiry after issue', async () => {
    await expect(svc.create({ ...base(), status: 'issued' })).rejects.toThrow(/issue date/u)
    await expect(svc.create({ ...base(), status: 'issued', issuedAt: day(5), expiresAt: day(5) })).rejects.toThrow(/expiry must be after/u)
    const p = await svc.create(base())
    await expect(svc.update({ id: p.id, organizationId: id.org, status: 'issued' })).rejects.toThrow(/issue date/u)
    const issued = await svc.update({ id: p.id, organizationId: id.org, status: 'issued', issuedAt: day(1), expiresAt: day(200) })
    expect(issued.status).toBe('issued')
    await expect(svc.update({ id: p.id, organizationId: id.org, expiresAt: day(0) })).rejects.toThrow(/expiry must be after/u)
  })

  it('enforces the status transition table (ED-061)', async () => {
    const p = await svc.create(base())
    await expect(svc.update({ id: p.id, organizationId: id.org, status: 'final_approved' })).rejects.toThrow(/applied → final_approved/u)
    await svc.update({ id: p.id, organizationId: id.org, status: 'withdrawn' })
    await expect(svc.update({ id: p.id, organizationId: id.org, status: 'applied' })).rejects.toThrow(/withdrawn → applied/u)
    const q = await svc.create({ ...base(), status: 'issued', issuedAt: day(1) })
    await svc.update({ id: q.id, organizationId: id.org, status: 'expired' })
    const renewed = await svc.update({ id: q.id, organizationId: id.org, status: 'issued', issuedAt: day(30) })
    expect(renewed.status).toBe('issued')
    await svc.update({ id: q.id, organizationId: id.org, status: 'final_approved' })
    await expect(svc.update({ id: q.id, organizationId: id.org, status: 'issued' })).rejects.toThrow(/final_approved → issued/u)
  })

  it('schedules jurisdiction inspections on issued permits and records results', async () => {
    const applied = await svc.create(base())
    await expect(svc.scheduleInspection({ organizationId: id.org, permitId: applied.id, inspectionType: 'Framing', scheduledAt: day(3) }))
      .rejects.toThrow(/scheduled on issued permits/u)
    const p = await svc.create({ ...base(), status: 'issued', issuedAt: day(1) })
    const insp = await svc.scheduleInspection({ organizationId: id.org, permitId: p.id, inspectionType: 'Framing', scheduledAt: day(3), inspector: 'J. Ruiz' })
    expect(insp.result).toBeNull()
    expect((await svc.get(p.id, id.org))!.status).toBe('inspections_in_progress')
    await expect(svc.recordInspectionResult({ organizationId: id.org, id: insp.id, result: 'corrections_required' })).rejects.toThrow(/note is required/u)
    const rec = await svc.recordInspectionResult({ organizationId: id.org, id: insp.id, result: 'corrections_required', note: 'Missing hurricane ties' })
    expect(rec).toMatchObject({ result: 'corrections_required', resultNote: 'Missing hurricane ties', recordedByUserId: id.user })
    expect((await svc.listInspections({ organizationId: id.org, propertyId: id.prop })).map((i) => i.id)).toContain(insp.id)
    expect(await svc.listInspections({ organizationId: id.org, permitId: applied.id })).toHaveLength(0)
  })

  it('cross-tenant access → TenantViolationError', async () => {
    const x = randomUUID()
    await expect(svc.list({ organizationId: id.other })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.get(x, id.other)).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.create({ ...base(), organizationId: id.other })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.update({ id: x, organizationId: id.other })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.softDelete(x, id.other)).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.linkWorkOrder({ organizationId: id.other, permitId: x, workOrderId: x })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.unlinkWorkOrder({ organizationId: id.other, permitId: x, workOrderId: x })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.listInspections({ organizationId: id.other })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.scheduleInspection({ organizationId: id.other, permitId: x, inspectionType: 'X', scheduledAt: day(1) })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.recordInspectionResult({ organizationId: id.other, id: x, result: 'passed' })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.listJurisdictions(id.other)).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.upsertJurisdiction({ organizationId: id.other, name: 'X' })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.deleteJurisdiction(x, id.other)).rejects.toBeInstanceOf(TenantViolationError)
  })

  it("another org's permit is invisible under the caller's own org id (IDOR shape)", async () => {
    const db = getDb()
    const [p] = await db.insert(properties).values({ organizationId: id.other, addressLine1: '9 Other Rd', city: 'C', state: 'CA', postalCode: '0' }).returning()
    const [foreign] = await db.insert(permits).values({ organizationId: id.other, propertyId: p!.id, permitNumber: 'F-1', scope: 's', jurisdictionOther: 'X' }).returning()
    try {
      expect(await svc.get(foreign!.id, id.org)).toBeNull()
      await expect(svc.update({ id: foreign!.id, organizationId: id.org, notes: 'hijack' })).rejects.toThrow(/not found/u)
      await expect(svc.softDelete(foreign!.id, id.org)).rejects.toThrow(/not found/u)
      await expect(svc.scheduleInspection({ organizationId: id.org, permitId: foreign!.id, inspectionType: 'X', scheduledAt: day(1) })).rejects.toThrow(/not found/u)
      await expect(svc.create({ ...base(), propertyId: p!.id })).rejects.toThrow(/property not found/u)
      const [still] = await db.select().from(permits).where(eq(permits.id, foreign!.id))
      expect(still!.notes).toBeNull()
      expect(still!.deletedAt).toBeNull()
    } finally {
      await db.delete(permits).where(eq(permits.id, foreign!.id))
      await db.delete(properties).where(eq(properties.id, p!.id))
    }
  })

  afterAll(async () => {
    await getDb().delete(organizations).where(eq(organizations.id, id.other)).catch(() => {})
  })
})

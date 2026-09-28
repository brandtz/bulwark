/**
 * tests/integration/permits.real.test.ts — WP-X2 / ED-039: permits against a
 * per-tenant jurisdictions catalog, state validation and the tenant firewall.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { jurisdictions, memberships, organizations, permits, properties, users } from '../../server/db/schema'
import { RealPermitService } from '../../server/services/permit.real'
import { TenantViolationError, type TenantContext } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealPermitService (WP-X2 / ED-039)', () => {
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
    await db.delete(permits).where(eq(permits.organizationId, id.org))
    await db.delete(jurisdictions).where(eq(jurisdictions.organizationId, id.org))
    await db.delete(properties).where(eq(properties.organizationId, id.org))
    await db.delete(memberships).where(eq(memberships.userId, id.user))
  })

  it('creates a permit against a catalog jurisdiction and lists it', async () => {
    const j = await svc.upsertJurisdiction({ organizationId: id.org, name: 'City of Testville', code: 'TV' })
    const permit = await svc.create({ organizationId: id.org, propertyId: id.prop, kind: 'roofing', jurisdictionId: j.id, permitNumber: 'R-1' })
    expect(permit.status).toBe('draft')
    expect(permit.jurisdictionId).toBe(j.id)
    const list = await svc.list({ organizationId: id.org, propertyId: id.prop })
    expect(list.map((p) => p.id)).toContain(permit.id)
    expect((await svc.listJurisdictions(id.org)).map((x) => x.id)).toContain(j.id)
  })

  it('rejects catalog + "Other" together and an issued permit without its date', async () => {
    const j = await svc.upsertJurisdiction({ organizationId: id.org, name: 'County' })
    await expect(svc.create({ organizationId: id.org, propertyId: id.prop, kind: 'electrical', jurisdictionId: j.id, jurisdictionOther: 'Somewhere' }))
      .rejects.toThrow(/not both/u)
    await expect(svc.create({ organizationId: id.org, propertyId: id.prop, kind: 'electrical', status: 'issued' }))
      .rejects.toThrow(/issue date/u)
    const draft = await svc.create({ organizationId: id.org, propertyId: id.prop, kind: 'electrical', jurisdictionOther: 'Unincorporated' })
    await expect(svc.update({ id: draft.id, organizationId: id.org, status: 'issued' })).rejects.toThrow(/issue date/u)
    const issued = await svc.update({ id: draft.id, organizationId: id.org, status: 'issued', issuedAt: new Date().toISOString() })
    expect(issued.status).toBe('issued')
  })

  it('cross-tenant access → TenantViolationError', async () => {
    await expect(svc.list({ organizationId: id.other })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.create({ organizationId: id.other, propertyId: id.prop, kind: 'x' })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.listJurisdictions(id.other)).rejects.toBeInstanceOf(TenantViolationError)
  })
})

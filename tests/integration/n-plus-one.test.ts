/**
 * tests/integration/n-plus-one.test.ts — WP-L06 S4 batch reads.
 *
 * List pages used to resolve each row's property with its own `property.get`
 * RPC (O(K) round trips + queries); compliance reconcile fetched each stuck
 * doc's job one by one. The batch readers must issue O(1) queries for K ids
 * (counted by spying on the shared Drizzle client) and keep tenant scoping.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { inArray } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { jobs, organizations, properties } from '../../server/db/schema'
import { RealPropertyService } from '../../server/services/property.real'
import { RealJobService } from '../../server/services/job.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip
const K = 9

d('batch reads issue O(1) queries (WP-L06 S4)', () => {
  let orgId: string
  let otherOrgId: string
  let propertyIds: string[] = []
  let otherPropertyId: string
  let jobIds: string[] = []

  beforeAll(async () => {
    const db = getDb()
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const [o] = await db.insert(organizations).values({ name: 'L06 N+1', slug: `l06-n1-${stamp}` }).returning()
    const [o2] = await db.insert(organizations).values({ name: 'L06 N+1 other', slug: `l06-n1b-${stamp}` }).returning()
    orgId = o!.id
    otherOrgId = o2!.id
    const rows = await db.insert(properties).values(Array.from({ length: K }, (_, i) => ({
      organizationId: orgId, addressLine1: `${i} Batch St`, city: 'C', state: 'CA', postalCode: '0',
    }))).returning()
    propertyIds = rows.map((r) => r.id)
    const [other] = await db.insert(properties).values({ organizationId: otherOrgId, addressLine1: 'Other', city: 'C', state: 'CA', postalCode: '0' }).returning()
    otherPropertyId = other!.id
    // Rows only (the service would also enqueue on pg-boss, which this test does not need).
    const jobRows = await db.insert(jobs).values(Array.from({ length: 4 }, (_, i) => ({
      organizationId: orgId, kind: 'compliance_doc' as const, status: 'queued' as const, payload: { i },
    }))).returning()
    jobIds = jobRows.map((j) => j.id)
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(jobs).where(inArray(jobs.id, jobIds))
    await db.delete(properties).where(inArray(properties.organizationId, [orgId, otherOrgId]))
    await db.delete(organizations).where(inArray(organizations.id, [orgId, otherOrgId]))
  })

  it(`property.getMany resolves ${K} ids with one query and drops other-tenant ids`, async () => {
    const svc = new RealPropertyService()
    const spy = vi.spyOn(getDb(), 'select')
    try {
      const got = await svc.getMany([...propertyIds, otherPropertyId, propertyIds[0]!], orgId)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(got.map((p) => p.id).sort()).toEqual([...propertyIds].sort())
    } finally {
      spy.mockRestore()
    }
  })

  it('property.getMany handles empty input without a query and caps the batch', async () => {
    const svc = new RealPropertyService()
    const spy = vi.spyOn(getDb(), 'select')
    try {
      expect(await svc.getMany([], orgId)).toEqual([])
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
    const tooMany = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    await expect(svc.getMany(tooMany, orgId)).rejects.toThrow(/^Invalid getMany/)
  })

  it('job.getMany (compliance reconcile) is one query for many jobs', async () => {
    const svc = new RealJobService()
    const spy = vi.spyOn(getDb(), 'select')
    try {
      const map = await svc.getMany(jobIds, orgId)
      expect(spy).toHaveBeenCalledTimes(1)
      expect([...map.keys()].sort()).toEqual([...jobIds].sort())
    } finally {
      spy.mockRestore()
    }
    expect((await svc.getMany(jobIds, otherOrgId).catch(() => new Map())).size).toBe(0)
  })
})

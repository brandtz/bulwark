/**
 * tests/integration/compliance-reconcile.real.test.ts — L04-S4 orphan
 * reconciliation + re-enqueue (real Postgres; auto-skip without DATABASE_URL).
 *
 * reconcileGenerating() is exercised with directly-inserted doc/job rows (no
 * pg-boss needed — it only reads). reenqueue() runs against the real
 * pg-boss (it enqueues), which installs its own schema in the test DB;
 * stopBoss() in afterAll keeps vitest from hanging.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '../../server/db/client'
import {
  auditLog,
  deliverables as complianceDocs,
  jobs as jobsTable,
  organizations,
  properties,
} from '../../server/db/schema'
import { RealComplianceDocService } from '../../server/services/compliance.real'
import { stopBoss } from '../../server/jobs/boss'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const OLD = new Date(Date.now() - 60 * 60_000) // 60 min ago — past threshold

const SIGNATURE = {
  signedByName: 'Test GC',
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=',
  signedAt: new Date().toISOString(),
}

d('compliance reconcile + reenqueue (L04-S4)', () => {
  let orgId: string
  let propertyId: string
  let svc: RealComplianceDocService

  async function insertDoc(overrides: Partial<typeof complianceDocs.$inferInsert> = {}) {
    const db = getDb()
    const [doc] = await db
      .insert(complianceDocs)
      .values({
        organizationId: orgId,
        propertyId,
        workOrderIds: [],
        includedSlotIds: [],
        signature: SIGNATURE,
        status: 'generating',
        updatedAt: OLD,
        ...overrides,
      })
      .returning()
    return doc!
  }

  beforeAll(async () => {
    const db = getDb()
    const [org] = await db
      .insert(organizations)
      .values({ name: 'L04 Reconcile Org', slug: `l04r-${suffix}` })
      .returning()
    orgId = org!.id
    const [prop] = await db
      .insert(properties)
      .values({
        organizationId: orgId,
        addressLine1: '1 Reconcile Way',
        city: 'Springfield',
        state: 'OR',
        postalCode: '97477',
      })
      .returning()
    propertyId = prop!.id
    svc = new RealComplianceDocService(() => ({ organizationId: orgId, userId: 'system' }))
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(complianceDocs).where(eq(complianceDocs.organizationId, orgId))
    await db.delete(jobsTable).where(eq(jobsTable.organizationId, orgId))
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(properties).where(eq(properties.id, propertyId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await stopBoss().catch(() => {})
    await closeDb()
  })

  it('fails a stuck doc with no job attached', async () => {
    const doc = await insertDoc({ jobId: null })
    const out = await svc.reconcileGenerating({ organizationId: orgId, olderThanMinutes: 30 })
    expect(out.docIds).toContain(doc.id)
    const after = await svc.get(doc.id, orgId)
    expect(after?.status).toBe('failed')
    expect(after?.error).toMatch(/no job attached/i)
  })

  it('fails a stuck doc whose job already failed; leaves live jobs alone', async () => {
    const db = getDb()
    const [deadJob] = await db
      .insert(jobsTable)
      .values({ organizationId: orgId, kind: 'compliance_doc', status: 'failed', payload: {} })
      .returning()
    const [liveJob] = await db
      .insert(jobsTable)
      .values({ organizationId: orgId, kind: 'compliance_doc', status: 'running', payload: {} })
      .returning()
    const orphan = await insertDoc({ jobId: deadJob!.id })
    const inflight = await insertDoc({ jobId: liveJob!.id })

    const out = await svc.reconcileGenerating({ organizationId: orgId, olderThanMinutes: 30 })
    expect(out.docIds).toContain(orphan.id)
    expect(out.docIds).not.toContain(inflight.id)
    expect((await svc.get(orphan.id, orgId))?.status).toBe('failed')
    expect((await svc.get(inflight.id, orgId))?.status).toBe('generating')
  })

  it('syncs (not fails) a stuck doc whose job actually succeeded', async () => {
    const db = getDb()
    const [okJob] = await db
      .insert(jobsTable)
      .values({
        organizationId: orgId,
        kind: 'compliance_doc',
        status: 'succeeded',
        resultUrl: 'https://cdn.example.com/done.pdf',
        payload: {},
      })
      .returning()
    const doc = await insertDoc({ jobId: okJob!.id })
    await svc.reconcileGenerating({ organizationId: orgId, olderThanMinutes: 30 })
    const after = await svc.get(doc.id, orgId)
    expect(after?.status).toBe('ready')
    expect(after?.resultUrl).toBe('https://cdn.example.com/done.pdf')
  })

  it('reenqueue gives a failed doc a fresh job and flips it to generating', async () => {
    const doc = await insertDoc({ status: 'failed', error: 'boom', jobId: null })
    const updated = await svc.reenqueue(doc.id, orgId)
    expect(updated.status).toBe('generating')
    expect(updated.jobId).toBeTruthy()
    expect(updated.error).toBeNull()
  })

  it('reenqueue refuses a non-failed doc', async () => {
    const doc = await insertDoc({ status: 'ready', jobId: null })
    await expect(svc.reenqueue(doc.id, orgId)).rejects.toThrow(/only failed docs/i)
  })
})

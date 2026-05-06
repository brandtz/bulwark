/**
 * tests/integration/compliance.real.test.ts — RealComplianceDocService (E11-S10).
 *
 * Uses BULWARK_PDF_STUB=1 to short-circuit Puppeteer/R2 — the goal is to
 * validate the service + worker pipeline (create doc → enqueue job →
 * worker hydrates row → handler returns URL → syncFromJob mirrors state),
 * not the PDF renderer (covered by tests/unit/render-compliance-doc.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { complianceDocs } from '../../server/db/schema/compliance_docs'
import { jobs } from '../../server/db/schema/jobs'
import { properties } from '../../server/db/schema/properties'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { RealComplianceDocService } from '../../server/services/compliance.real'
import { getBoss, stopBoss, QUEUE_COMPLIANCE_DOC } from '../../server/jobs/boss'
import { HANDLERS } from '../../server/jobs/handlers'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

async function waitFor<T>(probe: () => Promise<T | null>, predicate: (v: T) => boolean, timeoutMs = 15_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = await probe()
    if (v && predicate(v)) return v
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Timed out waiting for condition')
}

d('RealComplianceDocService + worker (E11-S10)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string
  let propertyId: string

  beforeAll(async () => {
    process.env.BULWARK_PDF_STUB = '1'

    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'Compliance Org', slug: `e11s10-${stamp}` }).returning()
    orgId = o!.id
    const [p] = await db
      .insert(properties)
      .values({ organizationId: orgId, addressLine1: '123 Pine St', city: 'Bend', state: 'OR', postalCode: '97701' })
      .returning()
    propertyId = p!.id

    // Boot in-process worker that uses the real handlers.
    const boss = await getBoss()
    await boss.work<{ jobId: string; organizationId: string; kind: 'compliance_doc'; payload: Record<string, unknown> }>(
      QUEUE_COMPLIANCE_DOC,
      async (msgs) => {
        for (const m of msgs) {
          const env = m.data
          try {
            await db.update(jobs).set({ status: 'running', updatedAt: new Date() }).where(eq(jobs.id, env.jobId))
            const out = await HANDLERS[env.kind]!(env)
            await db
              .update(jobs)
              .set({ status: 'succeeded', resultUrl: out?.resultUrl ?? null, updatedAt: new Date() })
              .where(eq(jobs.id, env.jobId))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await db.update(jobs).set({ status: 'failed', error: msg, updatedAt: new Date() }).where(eq(jobs.id, env.jobId))
            throw err
          }
        }
      },
    )
  }, 30_000)

  afterAll(async () => {
    delete process.env.BULWARK_PDF_STUB
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(complianceDocs).where(eq(complianceDocs.organizationId, orgId))
    await db.delete(jobs).where(eq(jobs.organizationId, orgId))
    await db.delete(properties).where(eq(properties.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await stopBoss()
  }, 15_000)

  it('create() + syncFromJob() drives doc to ready with resultUrl', async () => {
    const svc = new RealComplianceDocService()
    const doc = await svc.create({
      organizationId: orgId,
      propertyId,
      workOrderIds: ['00000000-0000-0000-0000-000000000001'],
      includedSlotIds: ['00000000-0000-0000-0000-000000000002'],
      signature: {
        signedByName: 'J. Doe',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=',
      },
    })
    expect(doc.status).toBe('generating')
    expect(doc.jobId).toBeTruthy()

    // Wait for the linked job to terminate.
    const ready = await waitFor(
      () => svc.syncFromJob(doc.id, orgId),
      (d) => d.status === 'ready' || d.status === 'failed',
      20_000,
    )
    expect(ready.status).toBe('ready')
    expect(ready.resultUrl).toMatch(/^https?:\/\//)
    expect(ready.resultUrl).toContain('stub=1')
  }, 30_000)
})

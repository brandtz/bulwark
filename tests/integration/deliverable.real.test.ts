/** Real deliverable service + compatibility worker pipeline integration test. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { deliverables } from '../../server/db/schema/deliverables'
import { jobs } from '../../server/db/schema/jobs'
import { properties } from '../../server/db/schema/properties'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { RealDeliverableService } from '../../server/services/deliverable.real'
import { getBoss, stopBoss, QUEUE_COMPLIANCE_DOC } from '../../server/jobs/boss'
import { HANDLERS } from '../../server/jobs/handlers'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

async function waitFor<T>(probe: () => Promise<T | null>, predicate: (value: T) => boolean, timeoutMs = 15_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await probe()
    if (value && predicate(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for condition')
}

d('RealDeliverableService + compatibility worker', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let organizationId: string
  let propertyId: string

  beforeAll(async () => {
    process.env.BULWARK_PDF_STUB = '1'
    const db = getDb()
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Deliverable Org', slug: `x1-deliverable-${stamp}` })
      .returning()
    organizationId = organization!.id
    const [property] = await db
      .insert(properties)
      .values({ organizationId, addressLine1: '123 Pine St', city: 'Bend', state: 'OR', postalCode: '97701' })
      .returning()
    propertyId = property!.id

    const boss = await getBoss()
    await boss.work<{ jobId: string; organizationId: string; kind: 'compliance_doc'; payload: Record<string, unknown> }>(
      QUEUE_COMPLIANCE_DOC,
      async (messages) => {
        for (const message of messages) {
          const envelope = message.data
          try {
            await db.update(jobs).set({ status: 'running', updatedAt: new Date() }).where(eq(jobs.id, envelope.jobId))
            const output = await HANDLERS[envelope.kind]!(envelope)
            await db
              .update(jobs)
              .set({ status: 'succeeded', resultUrl: output?.resultUrl ?? null, updatedAt: new Date() })
              .where(eq(jobs.id, envelope.jobId))
          } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error)
            await db.update(jobs).set({ status: 'failed', error: messageText, updatedAt: new Date() }).where(eq(jobs.id, envelope.jobId))
            throw error
          }
        }
      },
    )
  }, 30_000)

  afterAll(async () => {
    delete process.env.BULWARK_PDF_STUB
    if (!organizationId) return
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, organizationId))
    await db.delete(deliverables).where(eq(deliverables.organizationId, organizationId))
    await db.delete(jobs).where(eq(jobs.organizationId, organizationId))
    await db.delete(properties).where(eq(properties.organizationId, organizationId))
    await db.delete(organizations).where(eq(organizations.id, organizationId))
    await stopBoss()
  }, 15_000)

  it('persists kind and syncs the generated artifact from its legacy queue job', async () => {
    const service = new RealDeliverableService()
    const deliverable = await service.create({
      organizationId,
      kind: 'completion_report',
      propertyId,
      workOrderIds: ['00000000-0000-0000-0000-000000000001'],
      includedSlotIds: ['00000000-0000-0000-0000-000000000002'],
      signature: {
        signedByName: 'J. Doe',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=',
      },
    })
    expect(deliverable.kind).toBe('completion_report')
    expect(deliverable.status).toBe('generating')
    expect(deliverable.jobId).toBeTruthy()
    const legacyRows = await getDb().execute(
      sql`SELECT id FROM compliance_docs WHERE id = ${deliverable.id}`,
    )
    expect(legacyRows).toHaveLength(1)

    const ready = await waitFor(
      () => service.syncFromJob(deliverable.id, organizationId),
      (row) => row.status === 'ready' || row.status === 'failed',
      20_000,
    )
    expect(ready.status).toBe('ready')
    expect(ready.resultUrl).toMatch(/^https?:\/\//)
    expect(ready.resultUrl).toContain('stub=1')
  }, 30_000)
})
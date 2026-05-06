/**
 * tests/integration/job.real.test.ts — RealJobService + worker pipeline (E11-S9).
 *
 * # Decisions (ADR-0008)
 *   - Boots pg-boss in-process and registers the same handler the real
 *     worker uses, then enqueues a compliance_doc job and polls until
 *     the row reaches a terminal status.
 *   - Tests skip when DATABASE_URL is unset (matches the rest of the
 *     integration suite — see tests/setup/env.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { jobs } from '../../server/db/schema/jobs'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { RealJobService } from '../../server/services/job.real'
import { getBoss, stopBoss, QUEUE_COMPLIANCE_DOC } from '../../server/jobs/boss'
import { HANDLERS } from '../../server/jobs/handlers'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

async function waitForTerminal(jobId: string, organizationId: string, svc: RealJobService, timeoutMs = 15_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const j = await svc.get(jobId, organizationId)
    if (j && (j.status === 'succeeded' || j.status === 'failed')) return j
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Job ${jobId} never reached terminal state`)
}

d('RealJobService + worker pipeline (E11-S9)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'Job Org', slug: `e11job-${stamp}` }).returning()
    orgId = o!.id

    // Register an in-process consumer so the test doesn't need an
    // external worker process.
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
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(jobs).where(eq(jobs.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await stopBoss()
  }, 15_000)

  it('create() enqueues a job, worker drains it to succeeded', async () => {
    const svc = new RealJobService()
    const created = await svc.create({
      organizationId: orgId,
      kind: 'compliance_doc',
      payload: { propertyId: 'test' },
    })
    expect(created.status).toBe('queued')
    expect(created.organizationId).toBe(orgId)

    const terminal = await waitForTerminal(created.id, orgId, svc)
    expect(terminal.status).toBe('succeeded')
    expect(terminal.resultUrl).toMatch(/^https?:\/\//)
  }, 30_000)

  it('get() returns null for an unknown id', async () => {
    const svc = new RealJobService()
    const missing = await svc.get('00000000-0000-0000-0000-000000000000', orgId)
    expect(missing).toBeNull()
  })
})

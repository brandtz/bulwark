/**
 * server/jobs/worker.ts — Bulwark background worker entrypoint (E11-S9).
 *
 * Long-running Node process started by `pnpm run worker:jobs` on
 * Render. Subscribes to every queue defined by JobKind, dispatches
 * each message into its handler (server/jobs/handlers/*), and writes
 * terminal status back to OUR `jobs` table.
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - Worker is a plain Node script — NOT a Nuxt/Nitro endpoint. It
 *     boots pg-boss + Drizzle directly. This keeps cold-start fast and
 *     means the worker can scale independently of the web tier.
 *   - On status updates we write through the same `withAudit` pattern
 *     so the audit trail captures who/what flipped each job.
 *   - SIGTERM / SIGINT trigger a graceful shutdown so Render rolling
 *     restarts don't drop in-flight handlers.
 */
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { jobs } from '../db/schema/jobs'
import { getBoss, stopBoss } from './boss'
import { HANDLERS, type JobEnvelope } from './handlers'
import { auditLog } from '../db/schema/audit_log'
import type { JobKind } from '../../shared/contracts/job'

const KINDS: JobKind[] = ['compliance_doc']

async function markRunning(jobId: string): Promise<void> {
  const db = getDb()
  await db.update(jobs).set({ status: 'running', updatedAt: new Date() }).where(eq(jobs.id, jobId))
}

async function markSucceeded(jobId: string, organizationId: string, resultUrl: string | null): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .update(jobs)
      .set({ status: 'succeeded', resultUrl, error: null, updatedAt: new Date() })
      .where(eq(jobs.id, jobId))
    await tx.insert(auditLog).values({
      organizationId,
      entityType: 'job',
      entityId: jobId,
      action: 'state_change',
      actorUserId: null,
      metadata: { from: 'running', to: 'succeeded', resultUrl },
    })
  })
}

async function markFailed(jobId: string, organizationId: string, message: string): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .update(jobs)
      .set({ status: 'failed', error: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(jobs.id, jobId))
    await tx.insert(auditLog).values({
      organizationId,
      entityType: 'job',
      entityId: jobId,
      action: 'state_change',
      actorUserId: null,
      metadata: { from: 'running', to: 'failed', error: message.slice(0, 500) },
    })
  })
}

async function start(): Promise<void> {
   
  console.log('[worker] starting…')
  const boss = await getBoss()

  for (const kind of KINDS) {
    // pg-boss queue name === JobKind value (see boss.ts mapping).
    const queue = kind
    await boss.work<JobEnvelope>(queue, async (jobs) => {
      // pg-boss v10+ batches messages into an array. Run sequentially
      // so a single worker process doesn't oversubscribe DB connections.
      for (const m of jobs) {
        const env = m.data
        try {
          await markRunning(env.jobId)
          const handler = HANDLERS[env.kind]
          if (!handler) throw new Error(`No handler for kind ${env.kind}`)
          const out = await handler(env)
          await markSucceeded(env.jobId, env.organizationId, out?.resultUrl ?? null)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
           
          console.error(`[worker] job ${env.jobId} (${env.kind}) failed:`, msg)
          await markFailed(env.jobId, env.organizationId, msg)
          // Re-throw so pg-boss records its own failure metric (and
          // applies retry policy if we configure one later).
          throw err
        }
      }
    })
     
    console.log(`[worker] subscribed to queue: ${queue}`)
  }

  const shutdown = async (signal: string) => {
     
    console.log(`[worker] received ${signal}, shutting down…`)
    await stopBoss().catch((e) => console.error('[worker] stopBoss error', e))
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

   
  console.log('[worker] ready')
}

start().catch((err) => {
   
  console.error('[worker] fatal startup error', err)
  process.exit(1)
})

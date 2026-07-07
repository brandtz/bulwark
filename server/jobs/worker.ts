/**
 * server/jobs/worker.ts — Bulwark background worker entrypoint
 * (E11-S9, hardened in L04/L05).
 *
 * Long-running Node process started by `pnpm run worker:jobs` on
 * Render. Subscribes to every queue in the JobKind registry, dispatches
 * each message into its handler (server/jobs/handlers/*), and writes
 * terminal status back to OUR `jobs` table.
 *
 * # Decisions (ADR-0008, ADR-0012, ADR-0005)
 *   - Worker is a plain Node script — NOT a Nuxt/Nitro endpoint. It
 *     boots pg-boss + Drizzle directly. This keeps cold-start fast and
 *     means the worker can scale independently of the web tier.
 *   - **Prod fail-closed (L04-S2):** boot calls `assertProdWorkerEnv()` and
 *     refuses to start with stub flags in production. Minimal local guard
 *     until L07-S4's consolidated env-guard replaces it.
 *   - **Kinds derive from the policy registry (L04-S5):** `ALL_JOB_KINDS`
 *     comes from `policy.ts`, so subscribing, queue creation, and retry
 *     policy can never drift.
 *   - **A thrown handler re-throws to pg-boss** so the L04-S1 retry policy
 *     applies. Our `jobs` row flips to `failed` on every attempt and back to
 *     `running`/`succeeded` if a later retry lands — the row always reflects
 *     the latest attempt, and `_runSummary` records the last success.
 *   - **Alerting (L05-S4):** per-kind consecutive-failure streaks trip a
 *     one-shot system-error audit row + metric at 3; Sentry capture attaches
 *     here when L08 lands.
 *   - SIGTERM / SIGINT trigger a graceful shutdown so Render rolling
 *     restarts don't drop in-flight handlers.
 */
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { jobs } from '../db/schema/jobs'
import { getBoss, stopBoss } from './boss'
import { HANDLERS, type JobEnvelope, type JobHandlerResult } from './handlers'
import { auditLog } from '../db/schema/audit_log'
import { ALL_JOB_KINDS } from './policy'
import { assertProdWorkerEnv } from './env-guard'
import { ConsecutiveFailureTracker } from './failure-alert'
import { COUNTERS, incCounter } from '../utils/metrics'

const failureTracker = new ConsecutiveFailureTracker(3)

async function markRunning(jobId: string): Promise<void> {
  const db = getDb()
  await db.update(jobs).set({ status: 'running', updatedAt: new Date() }).where(eq(jobs.id, jobId))
}

async function markSucceeded(
  jobId: string,
  organizationId: string,
  out: JobHandlerResult | undefined,
): Promise<void> {
  const db = getDb()
  const resultUrl = out?.resultUrl ?? null
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ payload: jobs.payload })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)
    await tx
      .update(jobs)
      .set({
        status: 'succeeded',
        resultUrl,
        error: null,
        updatedAt: new Date(),
        // Preserve the original payload; fold the run summary in so the
        // super-admin jobs surface can show counts without a new table.
        ...(out?.summary
          ? { payload: { ...(row?.payload ?? {}), _runSummary: out.summary } }
          : {}),
      })
      .where(eq(jobs.id, jobId))
    await tx.insert(auditLog).values({
      organizationId,
      entityType: 'job',
      entityId: jobId,
      action: 'state_change',
      actorUserId: null,
      metadata: {
        from: 'running',
        to: 'succeeded',
        resultUrl,
        ...(out?.summary ? { summary: out.summary } : {}),
      },
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

/** One-shot ops signal when a kind has failed 3 straight times (L05-S4). */
async function recordFailureAlert(kind: string, error: string): Promise<void> {
  const outcome = failureTracker.recordFailure(kind)
  if (!outcome.shouldAlert) return
  try {
    const { RealAuditService } = await import('../services/audit.real')
    await new RealAuditService().logSystemError({
      kind: 'job_consecutive_failures',
      message: `Job kind "${kind}" has failed ${outcome.streak} consecutive times`,
      metadata: { jobKind: kind, streak: outcome.streak, lastError: error.slice(0, 500) },
    })
  } catch {
    // Alerting must never take down the worker loop.
  }
}

async function start(): Promise<void> {
  // L04-S2: refuse to run a production worker with dev/test stubs active.
  assertProdWorkerEnv()

  console.log('[worker] starting…')
  const boss = await getBoss()

  for (const kind of ALL_JOB_KINDS) {
    // pg-boss queue name === JobKind value (see boss.ts / policy.ts).
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
          await markSucceeded(env.jobId, env.organizationId, out)
          failureTracker.recordSuccess(env.kind)
          incCounter(COUNTERS.jobsSucceededTotal)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)

          console.error(`[worker] job ${env.jobId} (${env.kind}) failed:`, msg)
          await markFailed(env.jobId, env.organizationId, msg)
          incCounter(COUNTERS.jobsFailedTotal)
          await recordFailureAlert(env.kind, msg)
          // Re-throw so pg-boss applies the L04-S1 retry policy and
          // records its own failure metric.
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

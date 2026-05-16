/**
 * server/services/_queue/index.ts — generic background-job queue
 * (W3-1 / EH-J / ADR-0028).
 *
 * # Decisions (ADR-0008, ADR-0028)
 *   - Single `enqueueJob({ kind, payload, runAt?, maxAttempts? })` API
 *     so the caller never sees the underlying engine. The Phase 1
 *     default impl runs the handler in-process via `setTimeout` —
 *     identical behaviour to the W2-4 inline retry loop.
 *   - Job handlers are registered at process boot via
 *     `registerJobHandler(kind, handler)`. The webhook dispatcher
 *     registers `webhook.deliver`; future kinds (e.g.
 *     `email.send`, `report.generate`) follow the same shape.
 *   - **Retry policy** is the handler's job to declare via the
 *     `maxAttempts` argument and the throw/return contract: throwing
 *     a job triggers the queue to re-enqueue with the next backoff
 *     delay (`1s, 4s, 16s, 60s, …`, exponential up to a cap).
 *   - **Promotion path**: in Phase 2, swap the default factory for a
 *     `pg-boss` adapter that calls `boss.send(kind, payload, {
 *     startAfter, retryLimit })`. The job handler registration becomes
 *     `boss.work(kind, handler)`. The caller surface stays identical.
 *
 * # Decisions cast down
 *   - Rejected: a fancier "DAG of jobs" abstraction. Bulwark Phase 1
 *     fanout is `event → 0..N jobs`; we never need job→job.
 *   - Rejected: exposing the in-flight job count for tests. The
 *     existing webhook test never asserted on it; instead tests await
 *     `flushQueueForTests()` which drains the timer set.
 *   - Rejected: persisting jobs to disk in the default impl. That's
 *     pg-boss's domain. The in-memory queue is best-effort and dies
 *     with the process. The webhook dispatcher is therefore eventual-
 *     consistent within a single process lifetime.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// W3-5 / EH-Q (ADR-0034): structured logger + counters for job dispatch.
import { log } from '../../utils/logger'
import { incCounter, COUNTERS } from '../../utils/metrics'

export type JobHandler<P = any> = (payload: P, ctx: { attempt: number; kind: string }) => Promise<void>

export interface EnqueueOpts<P = unknown> {
  kind: string
  payload: P
  /** Absolute `Date` or ms-offset from now. Defaults to "immediate". */
  runAt?: Date | number
  /** Defaults to 3 (matches the W2-4 webhook retry budget). */
  maxAttempts?: number
}

interface InFlight {
  timer: NodeJS.Timeout
}

const handlers = new Map<string, JobHandler<any>>()
const inFlight = new Set<InFlight>()

/** Exponential-ish backoff: 1s, 4s, 16s, 60s thereafter. */
function backoffFor(attempt: number): number {
  const table = [1000, 4000, 16000]
  return attempt <= table.length ? table[attempt - 1]! : 60_000
}

function scheduleAttempt<P>(opts: {
  kind: string
  payload: P
  attempt: number
  maxAttempts: number
  delayMs: number
}): void {
  const slot: InFlight = { timer: null as unknown as NodeJS.Timeout }
  slot.timer = setTimeout(async () => {
    inFlight.delete(slot)
    const handler = handlers.get(opts.kind)
    if (!handler) {
      // No handler registered — log + drop. This is a programmer error
      // (you enqueued before registering) so don't retry silently.
      log('error', 'queue.no_handler', { kind: opts.kind })
      incCounter(COUNTERS.jobsFailedTotal)
      return
    }
    try {
      await handler(opts.payload, { attempt: opts.attempt, kind: opts.kind })
    } catch (err) {
      log('error', 'queue.attempt_failed', {
        kind: opts.kind,
        attempt: opts.attempt,
        error: err instanceof Error ? err.message : 'unknown',
      })
      incCounter(COUNTERS.jobsFailedTotal)
      if (opts.attempt < opts.maxAttempts) {
        scheduleAttempt({
          kind: opts.kind,
          payload: opts.payload,
          attempt: opts.attempt + 1,
          maxAttempts: opts.maxAttempts,
          delayMs: backoffFor(opts.attempt),
        })
      }
    }
  }, opts.delayMs)
  inFlight.add(slot)
  // Prevent the timer from holding the event loop open in serverless
  // edge envs that care (Node 18+ supports `.unref()`).
  if (typeof slot.timer.unref === 'function') slot.timer.unref()
}

/**
 * Register a handler for a given job `kind`. Idempotent — re-registering
 * the same kind replaces the prior handler so HMR / test setup is safe.
 */
export function registerJobHandler<P>(kind: string, handler: JobHandler<P>): void {
  handlers.set(kind, handler as JobHandler<any>)
}

/**
 * Enqueue a job. Returns immediately; the handler runs in the
 * background via `setTimeout`.
 */
export function enqueueJob<P>(opts: EnqueueOpts<P>): void {
  incCounter(COUNTERS.jobsEnqueuedTotal)
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3)
  let delayMs = 0
  if (opts.runAt instanceof Date) delayMs = Math.max(0, opts.runAt.getTime() - Date.now())
  else if (typeof opts.runAt === 'number') delayMs = Math.max(0, opts.runAt)
  scheduleAttempt({
    kind: opts.kind,
    payload: opts.payload,
    attempt: 1,
    maxAttempts,
    delayMs,
  })
}

/**
 * Test-only: cancel every pending timer + clear handler registry.
 * Vitest runs need this so jobs from one spec don't fire into the next.
 */
export function __resetQueueForTests(): void {
  for (const slot of inFlight) clearTimeout(slot.timer)
  inFlight.clear()
  handlers.clear()
}

/** Test-only: count of in-flight (pending) timers. */
export function __queueDepthForTests(): number {
  return inFlight.size
}

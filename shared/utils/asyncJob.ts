/**
 * shared/utils/asyncJob.ts — async job polling primitives (E7-S1).
 *
 * # Decisions (ADR-0008)
 *   - The pollable surface is a **pure async function** that takes a
 *     getter and a delay. No Vue / Nuxt imports here, so the unit
 *     tests can exercise it inside Vitest without a full Nuxt env.
 *   - Polling stops on terminal status (`succeeded` / `failed`),
 *     timeout, or AbortSignal. We always re-fetch once per tick;
 *     consumers don't rely on cached state.
 *   - Errors thrown by the getter are propagated; we don't swallow
 *     them or treat them as job-failures, because a 500 on the
 *     polling endpoint is a transport problem, not a job-runner one.
 *
 * # Decision cast down
 *   - Rejected: exposing a backoff. The mock cadence is fixed (~2s);
 *     the real backend will run 1s polling against a Postgres
 *     LISTEN/NOTIFY upgrade later. Keep the helper minimal — caller
 *     passes whatever interval they want.
 *   - Rejected: a Vue composable in this file. Compositions belong
 *     under app/composables/ where they get auto-imported. The unit
 *     test target for E7-S1 is the pure helper. The composable
 *     wrapper lands in E7-S2/S3.
 */
import type { Job, JobStatus } from '../contracts/job'
import { isTerminalJobStatus } from '../contracts/job'

export interface PollUntilTerminalOptions {
  /** Milliseconds between status fetches. */
  intervalMs: number
  /** Hard cap (ms). Defaults to 30s. */
  timeoutMs?: number
  /** Abort polling externally (e.g. component unmount). */
  signal?: AbortSignal
  /**
   * Callback invoked on every fetch (after the first). Useful for
   * UIs that want to surface every status transition.
   */
  onTick?: (job: Job) => void
  /**
   * Sleep implementation. Defaults to `setTimeout`-based promise.
   * Tests inject a fake-timer-friendly version.
   */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    // Ensure Node test runners don't keep the process alive on this timer.
    if (typeof (t as unknown as { unref?: () => void }).unref === 'function') {
      ;(t as unknown as { unref: () => void }).unref()
    }
  })

/**
 * Poll `getJob` until the job reaches a terminal state, the optional
 * timeout elapses, or the AbortSignal fires. The job is fetched once
 * immediately and then on each `intervalMs` tick.
 *
 * Throws:
 *   - `Error('Job not found')` when `getJob` returns null on the first
 *     fetch (a job that's missing on tick 0 is a bug, not a race).
 *   - `DOMException('Aborted', 'AbortError')` when the signal fires.
 *   - `Error('Job polling timed out')` when `timeoutMs` is reached.
 *   - Any error thrown by `getJob`.
 */
export async function pollUntilTerminal(
  getJob: () => Promise<Job | null>,
  opts: PollUntilTerminalOptions,
): Promise<Job> {
  const start = Date.now()
  const sleep = opts.sleep ?? defaultSleep
  const timeoutMs = opts.timeoutMs ?? 30_000

  // Tick 0 — fetch immediately, throw if the job doesn't exist.
  let job = await getJob()
  if (!job) throw new Error('Job not found')
  if (isTerminalJobStatus(job.status)) return job
  opts.onTick?.(job)

  // Subsequent ticks until terminal / timeout / abort.
   
  while (true) {
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('Job polling timed out')
    }
    await sleep(opts.intervalMs)
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const next = await getJob()
    if (!next) {
      // Mid-flight disappearance — treat as a runner-side failure.
      throw new Error('Job vanished mid-poll')
    }
    job = next
    opts.onTick?.(job)
    if (isTerminalJobStatus(job.status)) return job
  }
}

export type { Job, JobStatus }

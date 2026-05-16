/**
 * server/utils/metrics.ts — in-memory metric counters
 * (W3-5 / EH-Q / ADR-0034).
 *
 * # Decisions (ADR-0008, ADR-0034)
 *   - **Process-local, in-memory only**. A `Map<name, number>` keyed
 *     by counter name. Reset on process restart — this is fine for
 *     the launch slice because (a) Render/Netlify run a single
 *     instance and (b) Prometheus exporter promotion lands in Phase 2.
 *   - **Increment-only public surface**. `inc(name, by?)` is the
 *     only mutator. A read function `snapshot()` returns a plain
 *     object for the `/api/metrics` endpoint.
 *   - **Documented counter names** kept in `COUNTERS`. Pre-seeding
 *     to 0 ensures the endpoint always returns the full set even on
 *     a cold process.
 */
export const COUNTERS = {
  requestsTotal: 'requests_total',
  requestsErroredTotal: 'requests_errored_total',
  jobsEnqueuedTotal: 'jobs_enqueued_total',
  jobsFailedTotal: 'jobs_failed_total',
  webhooksDeliveredTotal: 'webhooks_delivered_total',
  webhooksFailedTotal: 'webhooks_failed_total',
  notificationsDispatchedTotal: 'notifications_dispatched_total',
  // W5-1 / EH-R (ADR-0035) — incremented every time the rate-limit
  // middleware short-circuits a request with 429. Kept at the same
  // tier as request totals so /api/metrics can compute a block ratio.
  rateLimitBlocksTotal: 'rate_limit_blocks_total',
} as const

export type CounterName = (typeof COUNTERS)[keyof typeof COUNTERS]

const counters = new Map<string, number>()

function ensureSeeded(): void {
  for (const k of Object.values(COUNTERS)) {
    if (!counters.has(k)) counters.set(k, 0)
  }
}

ensureSeeded()

export function incCounter(name: CounterName, by = 1): void {
  ensureSeeded()
  counters.set(name, (counters.get(name) ?? 0) + by)
}

export function readCounter(name: CounterName): number {
  ensureSeeded()
  return counters.get(name) ?? 0
}

export function snapshotMetrics(): Record<string, number> {
  ensureSeeded()
  const out: Record<string, number> = {}
  for (const [k, v] of counters.entries()) out[k] = v
  return out
}

/** Test-only: reset all counters to zero. */
export function __resetCountersForTests(): void {
  counters.clear()
  ensureSeeded()
}

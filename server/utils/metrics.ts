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
  jobsSucceededTotal: 'jobs_succeeded_total',
  jobsFailedTotal: 'jobs_failed_total',
  webhooksDeliveredTotal: 'webhooks_delivered_total',
  webhooksFailedTotal: 'webhooks_failed_total',
  notificationsDispatchedTotal: 'notifications_dispatched_total',
  commsDeliveryFailedTotal: 'comms_delivery_failed_total',
  // W5-1 / EH-R (ADR-0035) — incremented every time the rate-limit
  // middleware short-circuits a request with 429. Kept at the same
  // tier as request totals so /api/metrics can compute a block ratio.
  rateLimitBlocksTotal: 'rate_limit_blocks_total',
  // WP-L08 S3: failed sign-ins and comms deliveries attempted.
  authFailuresTotal: 'auth_failures_total',
  commsDeliveriesTotal: 'comms_deliveries_total',
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

// ---------------------------------------------------------------------------
// WP-L08 S3/S4: request-latency histogram + Prometheus text exposition.
// Per-instance like the counters (a serverless deploy has many short-lived
// instances; an external scraper sums them, or use the logs' durationMs).
// ---------------------------------------------------------------------------

/** Latency bucket upper bounds, in milliseconds. */
export const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const
/** Distinct route labels kept before new routes fold into "other" (bounded cardinality). */
const MAX_ROUTES = 300

interface Histogram { buckets: number[], sum: number, count: number }
const latency = new Map<string, Histogram>()

const UUIDISH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu

/** Collapse ids so /admin/quotes/<uuid> and /admin/quotes/<uuid2> share one label. */
export function routeLabel(path: string): string {
  const bare = path.split('?')[0] ?? path
  if (bare.startsWith('/_nuxt/')) return '/_nuxt/*'
  return bare.replace(UUIDISH, ':id').replace(/\/\d+(?=\/|$)/gu, '/:n') || '/'
}

export function observeLatency(route: string, method: string, ms: number): void {
  let key = `${method.toUpperCase()} ${route}`
  if (!latency.has(key) && latency.size >= MAX_ROUTES) key = `${method.toUpperCase()} other`
  let h = latency.get(key)
  if (!h) {
    h = { buckets: LATENCY_BUCKETS_MS.map(() => 0), sum: 0, count: 0 }
    latency.set(key, h)
  }
  const i = LATENCY_BUCKETS_MS.findIndex((b) => ms <= b)
  if (i >= 0) h.buckets[i]! += 1
  h.sum += ms
  h.count += 1
}

/** Bucket-interpolated quantile (p in 0..1), in ms; null with no samples. */
function quantile(h: Histogram, p: number): number | null {
  if (h.count === 0) return null
  const target = p * h.count
  let seen = 0
  for (let i = 0; i < h.buckets.length; i++) {
    const inBucket = h.buckets[i]!
    if (seen + inBucket >= target && inBucket > 0) {
      const lower = i === 0 ? 0 : LATENCY_BUCKETS_MS[i - 1]!
      const upper = LATENCY_BUCKETS_MS[i]!
      return lower + ((target - seen) / inBucket) * (upper - lower)
    }
    seen += inBucket
  }
  return LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1]! // beyond the last bucket
}

export interface RouteLatency { route: string, count: number, p50: number | null, p95: number | null }

/** Per-route p50/p95 (feeds the L10 perf budget). */
export function latencySummary(): RouteLatency[] {
  return [...latency.entries()]
    .map(([route, h]) => ({ route, count: h.count, p50: quantile(h, 0.5), p95: quantile(h, 0.95) }))
    .sort((a, b) => b.count - a.count)
}

/** Escape a Prometheus label value. */
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')

/** Prometheus text exposition format 0.0.4. */
export function renderPrometheus(): string {
  ensureSeeded()
  const lines: string[] = []
  for (const [name, value] of counters.entries()) {
    lines.push(`# TYPE bulwark_${name} counter`, `bulwark_${name} ${value}`)
  }
  lines.push('# HELP bulwark_http_request_duration_ms Request latency by method and route.')
  lines.push('# TYPE bulwark_http_request_duration_ms histogram')
  for (const [key, h] of latency.entries()) {
    const sp = key.indexOf(' ')
    const labels = `method="${esc(key.slice(0, sp))}",route="${esc(key.slice(sp + 1))}"`
    let cumulative = 0
    LATENCY_BUCKETS_MS.forEach((b, i) => {
      cumulative += h.buckets[i]!
      lines.push(`bulwark_http_request_duration_ms_bucket{${labels},le="${b}"} ${cumulative}`)
    })
    lines.push(`bulwark_http_request_duration_ms_bucket{${labels},le="+Inf"} ${h.count}`)
    lines.push(`bulwark_http_request_duration_ms_sum{${labels}} ${h.sum}`)
    lines.push(`bulwark_http_request_duration_ms_count{${labels}} ${h.count}`)
  }
  return lines.join('\n') + '\n'
}

/** Test-only: reset all counters and histograms. */
export function __resetCountersForTests(): void {
  counters.clear()
  latency.clear()
  ensureSeeded()
}

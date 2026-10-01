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
 *   - **Two scopes.** Every observation feeds the platform totals; one that
 *     knows its organization also feeds that org's own set. /api/metrics
 *     serves the platform view only to platform operators and the scrape
 *     bearer, and an org admin only their active org's set. Counters with no
 *     tenant (rate-limit blocks, pre-auth sign-in failures, the job worker)
 *     exist only in the platform view. Org sets are bounded (MAX_ORGS).
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

interface Histogram { buckets: number[], sum: number, count: number }

/** Per-organization counters and latency, for an org admin's own view. */
interface OrgMetrics { counters: Map<string, number>, latency: Map<string, Histogram> }
const MAX_ORGS = 2000
/** Counters recorded per organization; the rest are platform-only. */
export const ORG_COUNTERS: readonly CounterName[] = [
  COUNTERS.requestsTotal,
  COUNTERS.requestsErroredTotal,
  COUNTERS.notificationsDispatchedTotal,
  COUNTERS.commsDeliveriesTotal,
  COUNTERS.commsDeliveryFailedTotal,
]

function orgCounters(organizationId: string): Map<string, number> {
  const out = new Map<string, number>(ORG_COUNTERS.map((n) => [n, 0]))
  for (const [k, v] of orgs.get(organizationId)?.counters ?? []) out.set(k, v)
  return out
}
const orgs = new Map<string, OrgMetrics>()

function orgSet(organizationId: string | null | undefined): OrgMetrics | null {
  if (!organizationId) return null
  let m = orgs.get(organizationId)
  if (!m) {
    if (orgs.size >= MAX_ORGS) return null
    m = { counters: new Map(), latency: new Map() }
    orgs.set(organizationId, m)
  }
  return m
}

function ensureSeeded(): void {
  for (const k of Object.values(COUNTERS)) {
    if (!counters.has(k)) counters.set(k, 0)
  }
}

ensureSeeded()

export function incCounter(name: CounterName, by = 1, organizationId?: string | null): void {
  ensureSeeded()
  counters.set(name, (counters.get(name) ?? 0) + by)
  const org = ORG_COUNTERS.includes(name) ? orgSet(organizationId) : null
  if (org) org.counters.set(name, (org.counters.get(name) ?? 0) + by)
}

export function readCounter(name: CounterName): number {
  ensureSeeded()
  return counters.get(name) ?? 0
}

/** Platform totals, or one organization's counters when `organizationId` is given. */
export function snapshotMetrics(organizationId?: string): Record<string, number> {
  ensureSeeded()
  const source = organizationId === undefined ? counters : orgCounters(organizationId)
  const out: Record<string, number> = {}
  for (const [k, v] of source.entries()) out[k] = v
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

const latency = new Map<string, Histogram>()

const UUIDISH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu

/** Collapse ids so /admin/quotes/<uuid> and /admin/quotes/<uuid2> share one label. */
export function routeLabel(path: string): string {
  const bare = path.split('?')[0] ?? path
  if (bare.startsWith('/_nuxt/')) return '/_nuxt/*'
  return bare.replace(UUIDISH, ':id').replace(/\/\d+(?=\/|$)/gu, '/:n') || '/'
}

function record(into: Map<string, Histogram>, route: string, method: string, ms: number): void {
  let key = `${method.toUpperCase()} ${route}`
  if (!into.has(key) && into.size >= MAX_ROUTES) key = `${method.toUpperCase()} other`
  let h = into.get(key)
  if (!h) {
    h = { buckets: LATENCY_BUCKETS_MS.map(() => 0), sum: 0, count: 0 }
    into.set(key, h)
  }
  const i = LATENCY_BUCKETS_MS.findIndex((b) => ms <= b)
  if (i >= 0) h.buckets[i]! += 1
  h.sum += ms
  h.count += 1
}

export function observeLatency(route: string, method: string, ms: number, organizationId?: string | null): void {
  record(latency, route, method, ms)
  const org = orgSet(organizationId)
  if (org) record(org.latency, route, method, ms)
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
export function latencySummary(organizationId?: string): RouteLatency[] {
  const source = organizationId === undefined ? latency : orgs.get(organizationId)?.latency ?? new Map<string, Histogram>()
  return [...source.entries()]
    .map(([route, h]) => ({ route, count: h.count, p50: quantile(h, 0.5), p95: quantile(h, 0.95) }))
    .sort((a, b) => b.count - a.count)
}

/** Escape a Prometheus label value. */
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')

/** Prometheus text exposition format 0.0.4. */
export function renderPrometheus(organizationId?: string): string {
  ensureSeeded()
  const lines: string[] = []
  const counterSource = organizationId === undefined ? counters : orgCounters(organizationId)
  const latencySource = organizationId === undefined ? latency : orgs.get(organizationId)?.latency ?? new Map<string, Histogram>()
  for (const [name, value] of counterSource.entries()) {
    lines.push(`# TYPE bulwark_${name} counter`, `bulwark_${name} ${value}`)
  }
  lines.push('# HELP bulwark_http_request_duration_ms Request latency by method and route.')
  lines.push('# TYPE bulwark_http_request_duration_ms histogram')
  for (const [key, h] of latencySource.entries()) {
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
  orgs.clear()
  ensureSeeded()
}

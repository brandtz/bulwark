/**
 * tests/unit/observability.test.ts — WP-L08 S1-S4.
 *
 * - Error tracking is a no-op without SENTRY_DSN; with one, a thrown error is
 *   sent once as a Sentry envelope with scrubbed context.
 * - Latency is bucketed per route with ids collapsed; p50/p95 interpolate; the
 *   Prometheus text is well-formed and cumulative.
 * - Migration drift: DB behind the bundled journal is not ok; equal/ahead is.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEnvelope, captureException, markCaptured, parseDsn } from '~~/server/utils/error-tracking'
import {
  __resetCountersForTests,
  COUNTERS,
  incCounter,
  latencySummary,
  observeLatency,
  renderPrometheus,
  routeLabel,
} from '~~/server/utils/metrics'
import { checkMigrations, expectedMigration } from '~~/server/utils/migration-drift'

const DSN = 'https://abc123@o1.ingest.sentry.io/4567'

describe('error tracking (WP-L08 S1)', () => {
  const prev = process.env.SENTRY_DSN
  afterEach(() => {
    if (prev === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = prev
  })

  it('parses a DSN into the envelope endpoint and public key', () => {
    expect(parseDsn(DSN)).toEqual({ endpoint: 'https://o1.ingest.sentry.io/api/4567/envelope/', publicKey: 'abc123', dsn: DSN })
    expect(parseDsn('https://sentry.example.com/team/99')).toBeNull() // no key
    expect(parseDsn('not a dsn')).toBeNull()
    expect(parseDsn(undefined)).toBeNull()
  })

  it('does nothing without SENTRY_DSN', async () => {
    delete process.env.SENTRY_DSN
    const fetcher = vi.fn()
    await captureException(new Error('boom'), {}, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends one envelope per error, with scrubbed context', async () => {
    process.env.SENTRY_DSN = DSN
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const err = new Error('db exploded')
    await captureException(err, { requestId: 'r1', route: 'rpc quote.create', extra: { password: 'hunter2', quoteId: 'q1' } }, fetcher)
    await captureException(err, {}, fetcher) // same error again → deduped
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://o1.ingest.sentry.io/api/4567/envelope/')
    expect(init.headers['x-sentry-auth']).toContain('sentry_key=abc123')
    const [header, item, event] = (init.body as string).trim().split('\n').map((l) => JSON.parse(l))
    expect(header.dsn).toBe(DSN)
    expect(item.type).toBe('event')
    expect(event.exception.values[0]).toMatchObject({ type: 'Error', value: 'db exploded' })
    expect(event.tags.route).toBe('rpc quote.create')
    expect(event.extra.password).toBe('[REDACTED]')
    expect(event.extra.quoteId).toBe('q1')
    expect(event.extra.requestId).toBe('r1')
  })

  it('skips errors already marked captured and survives transport failure', async () => {
    process.env.SENTRY_DSN = DSN
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    const wrapped = new Error('wrapped 500')
    markCaptured(wrapped)
    await captureException(wrapped, {}, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    await expect(captureException(new Error('x'), {}, fetcher)).resolves.toBeUndefined()
  })

  it('builds a three-line envelope for non-Error values', () => {
    const env = buildEnvelope('plain string', {}, parseDsn(DSN)!)
    expect(env.trim().split('\n')).toHaveLength(3)
    expect(JSON.parse(env.trim().split('\n')[2]!).exception.values[0].value).toBe('plain string')
  })
})

describe('latency metrics + Prometheus (WP-L08 S3/S4)', () => {
  beforeEach(() => __resetCountersForTests())

  it('collapses ids in route labels', () => {
    expect(routeLabel('/admin/quotes/3f2b6c1e-8a4d-4c7e-9b1a-2d3e4f5a6b7c?x=1')).toBe('/admin/quotes/:id')
    expect(routeLabel('/api/items/42/edit')).toBe('/api/items/:n/edit')
    expect(routeLabel('/_nuxt/Abc123.js')).toBe('/_nuxt/*')
    expect(routeLabel('/api/services/quote/list')).toBe('/api/services/quote/list')
  })

  it('computes interpolated p50/p95 per route', () => {
    for (let i = 0; i < 90; i++) observeLatency('/api/x', 'post', 8) // ≤10 bucket
    for (let i = 0; i < 10; i++) observeLatency('/api/x', 'post', 400) // ≤500 bucket
    const [row] = latencySummary()
    expect(row).toMatchObject({ route: 'POST /api/x', count: 100 })
    expect(row!.p50!).toBeGreaterThan(5)
    expect(row!.p50!).toBeLessThanOrEqual(10)
    expect(row!.p95!).toBeGreaterThan(250)
    expect(row!.p95!).toBeLessThanOrEqual(500)
  })

  it('renders cumulative Prometheus histograms and counters', () => {
    incCounter(COUNTERS.authFailuresTotal, 3)
    observeLatency('/api/y', 'GET', 30)
    observeLatency('/api/y', 'GET', 30000) // beyond the last bucket → only in +Inf
    const text = renderPrometheus()
    expect(text).toContain('# TYPE bulwark_auth_failures_total counter')
    expect(text).toContain('bulwark_auth_failures_total 3')
    expect(text).toContain('bulwark_http_request_duration_ms_bucket{method="GET",route="/api/y",le="25"} 0')
    expect(text).toContain('bulwark_http_request_duration_ms_bucket{method="GET",route="/api/y",le="50"} 1')
    expect(text).toContain('bulwark_http_request_duration_ms_bucket{method="GET",route="/api/y",le="10000"} 1')
    expect(text).toContain('bulwark_http_request_duration_ms_bucket{method="GET",route="/api/y",le="+Inf"} 2')
    expect(text).toContain('bulwark_http_request_duration_ms_count{method="GET",route="/api/y"} 2')
    expect(text.endsWith('\n')).toBe(true)
  })

  it('bounds route cardinality', () => {
    for (let i = 0; i < 320; i++) observeLatency(`/r${i}`, 'GET', 1)
    const routes = latencySummary().map((r) => r.route)
    expect(routes.length).toBeLessThanOrEqual(301)
    expect(routes).toContain('GET other')
  })
})

describe('migration drift (WP-L08 S2)', () => {
  const dbReturning = (applied: string | number | null) => ({ execute: vi.fn().mockResolvedValue([{ applied }]) })

  it('is ok when the DB has the newest bundled migration (or newer)', async () => {
    const { when, tag } = expectedMigration()
    await expect(checkMigrations(dbReturning(String(when)) as never)).resolves.toMatchObject({ ok: true, expected: tag })
    await expect(checkMigrations(dbReturning(when + 1000) as never)).resolves.toMatchObject({ ok: true })
  })

  it('is not ok when the DB is behind or has no migrations recorded', async () => {
    const { when } = expectedMigration()
    await expect(checkMigrations(dbReturning(when - 1) as never)).resolves.toMatchObject({ ok: false })
    await expect(checkMigrations(dbReturning(null) as never)).resolves.toMatchObject({ ok: false, appliedWhen: null })
  })
})

/**
 * tests/e2e/observability.spec.ts — WP-L08 S2/S3 over HTTP.
 *
 * - /api/ready reports DB + migration state (the test DB is fully migrated).
 * - /api/metrics refuses anonymous and bad-bearer callers, serves admins JSON
 *   with per-route latency, and Prometheus text on request; request counters
 *   move between two scrapes.
 */
import { expect, test } from '@playwright/test'
import { signIn, signOut } from './_helpers'

test.describe('observability endpoints (WP-L08)', () => {
  test.skip(process.env.BULWARK_BACKEND === 'mock', 'readiness reads the real database')

  test('readiness reports a migrated database', async ({ request }) => {
    const res = await request.get('/api/ready')
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ ready: true, migrationsOk: true })
  })

  test('metrics: anonymous 401, bad bearer 401', async ({ request }) => {
    expect((await request.get('/api/metrics')).status()).toBe(401)
    const bad = await request.get('/api/metrics', { headers: { authorization: 'Bearer not-the-secret' } })
    expect(bad.status()).toBe(401)
  })

  test('metrics: admin gets JSON latency and Prometheus text; counters advance', async ({ context }) => {
    await signOut(context)
    await signIn(context, 'drew@bulwark.demo')
    const first = await context.request.get('/api/metrics')
    expect(first.status()).toBe(200)
    const json = await first.json()
    expect(json.counters).toHaveProperty('requests_total')
    expect(Array.isArray(json.latency)).toBe(true)
    expect(json.latency.length).toBeGreaterThan(0)
    expect(json.latency[0]).toHaveProperty('p95')

    const text = await context.request.get('/api/metrics?format=prometheus')
    expect(text.status()).toBe(200)
    expect(text.headers()['content-type']).toContain('text/plain')
    const body = await text.text()
    expect(body).toMatch(/^# TYPE bulwark_requests_total counter$/mu)
    expect(body).toMatch(/bulwark_http_request_duration_ms_bucket\{method="GET",route="[^"]+",le="\+Inf"\} \d+/u)

    const second = await (await context.request.get('/api/metrics')).json()
    expect(second.counters.requests_total).toBeGreaterThan(json.counters.requests_total)
  })
})

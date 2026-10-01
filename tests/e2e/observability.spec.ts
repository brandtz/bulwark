/**
 * tests/e2e/observability.spec.ts — WP-L08 S2/S3 over HTTP.
 *
 * - /api/ready reports DB + migration state (the test DB is fully migrated).
 * - /api/metrics refuses anonymous and bad-bearer callers; an org admin gets
 *   only their organization's counters and latency (JSON or Prometheus text);
 *   a platform operator or the scrape bearer gets the platform-wide view.
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

  test('metrics: the configured bearer is accepted without a session; a field user is refused', async ({ request, context }) => {
    const bearer = process.env.BULWARK_METRICS_BEARER
    test.skip(!bearer, 'server started without BULWARK_METRICS_BEARER')
    const ok = await request.get('/api/metrics?format=prometheus', { headers: { authorization: `Bearer ${bearer}` } })
    expect(ok.status()).toBe(200)
    expect(await ok.text()).toMatch(/^# TYPE bulwark_requests_total counter$/mu)

    await signOut(context)
    await signIn(context, 'matthew@bulwark.demo')
    expect((await context.request.get('/api/metrics')).status()).toBe(403)
  })

  // Isolation between organizations is unit-tested (tests/unit/observability.test.ts).
  test('metrics: an org admin gets only their organization\'s metrics; counters advance', async ({ context }) => {
    await signOut(context)
    await signIn(context, 'drew@bulwark.demo')
    const me = await (await context.request.post('/api/services/auth/currentUser', { data: { args: [] } })).json()
    const first = await context.request.get('/api/metrics')
    expect(first.status()).toBe(200)
    const json = await first.json()
    expect(json).toMatchObject({ scope: 'organization', organizationId: me.activeOrganizationId })
    expect(json.counters).toHaveProperty('requests_total')
    // Platform-only counters (no tenant) are not in an org's view.
    expect(json.counters).not.toHaveProperty('rate_limit_blocks_total')
    expect(json.counters).not.toHaveProperty('jobs_enqueued_total')
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

  test('metrics: a platform operator gets the platform-wide view', async ({ context }) => {
    test.skip(!(process.env.BULWARK_PLATFORM_ADMIN_EMAILS ?? '').includes('sasha@bulwark.platform'), 'server has no platform operator configured')
    await signOut(context)
    await signIn(context, 'sasha@bulwark.platform')
    const json = await (await context.request.get('/api/metrics')).json()
    expect(json.scope).toBe('platform')
    expect(json.counters).toHaveProperty('rate_limit_blocks_total')
    expect(json.counters).toHaveProperty('jobs_enqueued_total')
  })
})

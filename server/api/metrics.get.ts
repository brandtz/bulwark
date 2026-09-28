/**
 * server/api/metrics.get.ts — metrics snapshot (W3-5 / EH-Q / ADR-0034;
 * Prometheus exposition WP-L08 S3).
 *
 * # Decisions (ADR-0008, ADR-0034, ADR-0007)
 *   - **Two readers.** An `org_admin` / `super_admin` session (manual reads),
 *     or an external scraper presenting `Authorization: Bearer
 *     $BULWARK_METRICS_BEARER`. An unset bearer secret disables that path
 *     (fail closed, same doctrine as the cron guard).
 *   - **Two formats.** JSON by default (counters + per-route p50/p95);
 *     Prometheus text 0.0.4 with `?format=prometheus` or an `Accept:
 *     text/plain` header.
 *   - Values are per instance (process memory). On a serverless deploy each
 *     instance reports its own; the request logs carry durationMs for
 *     aggregate analysis.
 */
import { createRealServices } from '../utils/services-factory'
import { secretsMatch } from '../utils/cron-auth'
import { latencySummary, renderPrometheus, snapshotMetrics } from '../utils/metrics'

async function authorize(event: Parameters<typeof createRealServices>[0]): Promise<void> {
  const header = getHeader(event, 'authorization') ?? ''
  if (header.startsWith('Bearer ')) {
    const expected = process.env.BULWARK_METRICS_BEARER
    if (expected && secretsMatch(header.slice('Bearer '.length), expected)) return
    throw createError({ statusCode: 401, statusMessage: 'Invalid metrics credential' })
  }
  const services = await createRealServices(event)
  const session = await services.auth.currentUser()
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const role = session.memberships.find((m) => m.organizationId === session.activeOrganizationId)?.role
  if (role !== 'org_admin' && role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

export default defineEventHandler(async (event) => {
  await authorize(event)
  const wantsText = getQuery(event).format === 'prometheus'
    || (getHeader(event, 'accept') ?? '').includes('text/plain')
  if (wantsText) {
    setResponseHeader(event, 'content-type', 'text/plain; version=0.0.4; charset=utf-8')
    return renderPrometheus()
  }
  return {
    ts: new Date().toISOString(),
    counters: snapshotMetrics(),
    latency: latencySummary(),
  }
})

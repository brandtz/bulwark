/**
 * server/api/metrics.get.ts — metrics snapshot (W3-5 / EH-Q / ADR-0034;
 * Prometheus exposition WP-L08 S3).
 *
 * # Decisions (ADR-0008, ADR-0034, ADR-0007)
 *   - **Scoped by who asks.** The platform view (every tenant's traffic) goes
 *     to a platform operator (BULWARK_PLATFORM_ADMIN_EMAILS, ED-057) or an
 *     external scraper presenting `Authorization: Bearer
 *     $BULWARK_METRICS_BEARER`. An `org_admin` / `super_admin` session gets
 *     only its active organization's metrics: `super_admin` is an org
 *     membership role, not a platform role. Everyone else is refused (403).
 *     An unset bearer secret disables that path (fail closed, same doctrine as
 *     the cron guard).
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
import { platformOperatorEmails } from '../services/announcement.real'

type Scope = { scope: 'platform' } | { scope: 'organization', organizationId: string }

async function authorize(event: Parameters<typeof createRealServices>[0]): Promise<Scope> {
  const header = getHeader(event, 'authorization') ?? ''
  if (header.startsWith('Bearer ')) {
    const expected = process.env.BULWARK_METRICS_BEARER
    if (expected && secretsMatch(header.slice('Bearer '.length), expected)) return { scope: 'platform' }
    throw createError({ statusCode: 401, statusMessage: 'Invalid metrics credential' })
  }
  const services = await createRealServices(event)
  const session = await services.auth.currentUser()
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (platformOperatorEmails().has(session.email.trim().toLowerCase())) return { scope: 'platform' }
  const role = session.memberships.find((m) => m.organizationId === session.activeOrganizationId)?.role
  if (role !== 'org_admin' && role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return { scope: 'organization', organizationId: session.activeOrganizationId }
}

export default defineEventHandler(async (event) => {
  const who = await authorize(event)
  const orgId = who.scope === 'organization' ? who.organizationId : undefined
  const wantsText = getQuery(event).format === 'prometheus'
    || (getHeader(event, 'accept') ?? '').includes('text/plain')
  if (wantsText) {
    setResponseHeader(event, 'content-type', 'text/plain; version=0.0.4; charset=utf-8')
    return renderPrometheus(orgId)
  }
  return {
    ts: new Date().toISOString(),
    ...who,
    counters: snapshotMetrics(orgId),
    latency: latencySummary(orgId),
  }
})

/**
 * server/api/metrics.get.ts — admin-only JSON metrics snapshot
 * (W3-5 / EH-Q / ADR-0034).
 *
 * # Decisions (ADR-0008, ADR-0034)
 *   - **JSON, not Prometheus text format**. Phase 1 lives behind the
 *     admin auth gate; ops engineers read it manually or via a
 *     scripted curl. The Phase 2 ADR documents the `text/plain;
 *     version=0.0.4` Prometheus exporter.
 *   - **Admin-only**. We require an authenticated `org_admin` or
 *     `super_admin` session. The dispatcher's tenant firewall does
 *     not apply here because the counters are process-global; we
 *     simply forbid unauthenticated reads.
 */
import { createRealServices } from '../utils/services-factory'
import { snapshotMetrics } from '../utils/metrics'

export default defineEventHandler(async (event) => {
  const services = await createRealServices(event)
  const session = await services.auth.currentUser()
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const role = session.memberships.find((m) => m.organizationId === session.activeOrganizationId)?.role
  if (role !== 'org_admin' && role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return {
    ts: new Date().toISOString(),
    counters: snapshotMetrics(),
  }
})

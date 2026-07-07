/**
 * server/api/admin/jobs/index.get.ts — recent scheduled-job runs
 * (L05-S3 / ADR-0005).
 *
 * Super-admin only. Feeds /settings/jobs: the most recent runs of the two
 * platform-scheduled kinds (purge + COI scan) with status, timestamps, and
 * the `_runSummary` counts the worker folds into the payload on success.
 * Platform-scope read — see the listRecentRuns rationale in job.real.ts.
 */
import { RealJobService } from '../../../services/job.real'
import { createRealServices } from '../../../utils/services-factory'

export default defineEventHandler(async (event) => {
  const services = await createRealServices(event)
  const session = await services.auth.currentUser()
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  if (session.activeRole !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const runs = await new RealJobService().listRecentRuns({
    kinds: ['account_purge', 'coi_expiry_scan'],
    limit: 20,
  })
  return { runs }
})

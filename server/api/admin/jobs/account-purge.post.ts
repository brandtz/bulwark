/**
 * server/api/admin/jobs/account-purge.post.ts — enqueue the GDPR purge sweep
 * (L05-S2 / ADR-0005 / gap §3.3.1 BLOCKER).
 *
 * Trigger paths:
 *   - Platform scheduler: `Authorization: Bearer $BULWARK_CRON_SECRET`
 *     (Render cron curls this daily at 02:00 UTC — see render.yaml).
 *   - Manual: signed-in super_admin ("Run now" on /settings/jobs).
 *
 * The endpoint only ENQUEUES (202 + job id); the sweep itself runs on the
 * worker under the L04 retry policy. Job rows live under PLATFORM_ORG_ID —
 * platform maintenance, not tenant data (see shared/contracts/job.ts).
 */
import { PLATFORM_ORG_ID } from '../../../../shared/contracts/job'
import { RealJobService } from '../../../services/job.real'
import { authorizeCronTrigger } from '../../../utils/cron-auth'

export default defineEventHandler(async (event) => {
  const auth = await authorizeCronTrigger(event)
  if (!auth.ok) {
    throw createError({ statusCode: auth.status, statusMessage: auth.message })
  }

  // Platform-scope service (no tenant resolver) — same construction the
  // worker uses; the guard above is the auth boundary.
  const job = await new RealJobService().create({
    organizationId: PLATFORM_ORG_ID,
    kind: 'account_purge',
    payload: { triggeredVia: auth.via },
  })

  setResponseStatus(event, 202)
  return { jobId: job.id, kind: job.kind, status: job.status, triggeredVia: auth.via }
})

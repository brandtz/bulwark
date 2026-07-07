/**
 * server/api/admin/jobs/coi-expiry-scan.post.ts — enqueue the all-orgs COI
 * expiry sweep (L05-S2 / ADR-0005 / gap §3.3.2).
 *
 * Trigger paths:
 *   - Platform scheduler: `Authorization: Bearer $BULWARK_CRON_SECRET`
 *     (Render cron curls this nightly at 03:00 UTC — see render.yaml).
 *   - Manual: signed-in super_admin ("Run now" on /settings/jobs).
 *
 * Distinct from the org-scoped manual endpoint at
 * `/api/jobs/coi-expiry-check` (W3-4), which runs inline for a named org
 * list. THIS endpoint enqueues the worker sweep across every live org.
 */
import { z } from 'zod'
import { PLATFORM_ORG_ID } from '../../../../shared/contracts/job'
import { RealJobService } from '../../../services/job.real'
import { authorizeCronTrigger } from '../../../utils/cron-auth'

const BodySchema = z
  .object({ withinDays: z.number().int().min(1).max(365).optional() })
  .strict()
  .optional()

export default defineEventHandler(async (event) => {
  const auth = await authorizeCronTrigger(event)
  if (!auth.ok) {
    throw createError({ statusCode: auth.status, statusMessage: auth.message })
  }

  const parsed = BodySchema.safeParse(await readBody(event).catch(() => undefined))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }

  const job = await new RealJobService().create({
    organizationId: PLATFORM_ORG_ID,
    kind: 'coi_expiry_scan',
    payload: { triggeredVia: auth.via, ...(parsed.data?.withinDays ? { withinDays: parsed.data.withinDays } : {}) },
  })

  setResponseStatus(event, 202)
  return { jobId: job.id, kind: job.kind, status: job.status, triggeredVia: auth.via }
})

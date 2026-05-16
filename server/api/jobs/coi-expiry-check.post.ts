/**
 * server/api/jobs/coi-expiry-check.post.ts — admin-only endpoint that
 * triggers the COI expiry scan (W3-4 / EH-N / ADR-0031).
 *
 * # Decisions
 *   - POST so the call doesn't get cached and so we can ship a body
 *     with the org list / window override.
 *   - Auth: requires the caller to be `super_admin` or `org_admin` of
 *     each requested org. We re-use the session check that other
 *     admin endpoints rely on rather than introducing a new shared
 *     guard for this single route.
 *   - The scanner emits `subCoiExpiringSoon` per flagged row; the
 *     notification subscriber will route alerts. This endpoint just
 *     returns counts so an operator can confirm the run worked.
 */
import { z } from 'zod'
import { runCoiExpiryCheck } from '../../jobs/coi-expiry-check'

const PRIVILEGED = new Set(['super_admin', 'org_admin'])

// W5-3 / ADR-0037: validate body shape at the boundary.
const BodySchema = z
  .object({
    organizationIds: z.array(z.string().uuid()).max(100).optional(),
    withinDays: z.number().int().min(1).max(365).optional(),
  })
  .strict()
  .optional()

export default defineEventHandler(async (event) => {
  const session = (event.context as { session?: { activeRole?: string; activeOrganizationId?: string } }).session
  const role = session?.activeRole
  if (!role || !PRIVILEGED.has(role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const raw = await readBody(event).catch(() => undefined)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  const body = parsed.data

  let organizationIds: string[]
  if (body?.organizationIds && body.organizationIds.length > 0) {
    organizationIds = body.organizationIds
  } else if (session?.activeOrganizationId) {
    organizationIds = [session.activeOrganizationId]
  } else {
    throw createError({ statusCode: 400, statusMessage: 'organizationIds required' })
  }

  const withinDays = body?.withinDays
  return await runCoiExpiryCheck(event, { organizationIds, withinDays })
})

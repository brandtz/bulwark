/**
 * server/api/field/check-in.post.ts — record a field check-in / check-out
 * (W3-3 / EH-M / ADR-0029).
 *
 * # Behaviour
 *   POST body: {
 *     workOrderId?: string,
 *     propertyId: string,
 *     latitude: number,
 *     longitude: number,
 *     accuracy?: number,
 *     kind: 'in' | 'out',
 *   }
 *
 *   Writes one audit_log row. The row's `entityType` is the most
 *   specific anchor we have: 'work_order' when `workOrderId` is
 *   present, else 'property'. `action` is 'state_change' so audit
 *   filters can find it without widening the AuditActionSchema enum;
 *   `metadata.kind` (`field.check_in` / `field.check_out`) is the
 *   discriminator the field timeline reads.
 *
 * # Decisions (ADR-0008, ADR-0029)
 *   - **No new table.** Audit log is the source of truth (per
 *     deliverable C.2). The decision cast down was a dedicated
 *     `field_check_ins` table — rejected because (a) the only consumer
 *     for v1 is the WO timeline, which audit already powers, and (b)
 *     adding a table costs a migration + contract + service trio for
 *     a single insert path.
 *   - **Tenant firewall via `createRealServices`.** The factory
 *     resolves the active session once per request and binds it as the
 *     resolver into every service; the audit service's `record()`
 *     skips the firewall (internal pattern) but the surrounding org
 *     scoping comes from the snapshot. We do, however, gate on
 *     "session must exist".
 *   - **Coordinates pass through unchanged.** No rounding or
 *     truncation server-side; the row is the raw evidence the crew
 *     was there. Privacy review at the W3 deliverable.
 */
import { z } from 'zod'
import { createRealServices } from '~~/server/utils/services-factory'

const CheckInBodySchema = z.object({
  workOrderId: z.string().uuid().optional(),
  propertyId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(1_000_000).optional(),
  kind: z.enum(['in', 'out']),
})

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const raw = await readBody(event)
  const parsed = CheckInBodySchema.safeParse(raw)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid check-in payload: ${parsed.error.message}`,
    })
  }
  const body = parsed.data

  const services = await createRealServices(event)
  const orgId = (await services.auth.currentUser())?.activeOrganizationId
  if (!orgId) {
    throw createError({ statusCode: 401, statusMessage: 'No active organization' })
  }

  const entityType = body.workOrderId ? 'work_order' : 'property'
  const entityId = body.workOrderId ?? body.propertyId
  const kind = body.kind === 'in' ? 'field.check_in' : 'field.check_out'

  const row = await services.audit.record({
    organizationId: orgId,
    entityType,
    entityId,
    action: 'state_change',
    actorUserId: user.userId,
    metadata: {
      kind,
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy: body.accuracy ?? null,
      propertyId: body.propertyId,
      workOrderId: body.workOrderId ?? null,
    },
  })

  return {
    id: row.id,
    kind,
    recordedAt: row.createdAt,
  }
})

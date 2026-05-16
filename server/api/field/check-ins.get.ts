/**
 * server/api/field/check-ins.get.ts — list field check-in/out events for
 * a work order (W3-3 / EH-M / ADR-0029).
 *
 * Query: ?workOrderId=<uuid>
 *
 * Wraps `RealAuditService.getCheckInsForWorkOrder` (not on the audit
 * contract — see ADR-0029 deliverable C.3). Returns newest first.
 */
import { z } from 'zod'
import { createRealServices } from '~~/server/utils/services-factory'
import { RealAuditService } from '~~/server/services/audit.real'

const QuerySchema = z.object({
  workOrderId: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  const parsed = QuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  const services = await createRealServices(event)
  const current = await services.auth.currentUser()
  if (!current) {
    throw createError({ statusCode: 401, statusMessage: 'No active session' })
  }
  const audit = services.audit as unknown as RealAuditService
  const rows = await audit.getCheckInsForWorkOrder(
    parsed.data.workOrderId,
    current.activeOrganizationId,
  )
  return { rows }
})

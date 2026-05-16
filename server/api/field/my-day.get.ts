/**
 * server/api/field/my-day.get.ts — "My Day" feed for the field surface
 * (W3-3 / EH-M / ADR-0029).
 *
 * Returns the list of work orders scheduled for the signed-in user on
 * the requested day. Wraps `RealWorkOrderService.listForFieldUser`
 * which is documented as a v1 stub (today: all scheduled WOs in the
 * org for the day; W3+: filtered by slot-level user assignment).
 *
 * Query params:
 *   - date: ISO date (yyyy-mm-dd). Defaults to today (UTC).
 *
 * Returns: { rows: WorkOrder[], date: string }
 */
import { z } from 'zod'
import { createRealServices } from '~~/server/utils/services-factory'
import type { RealWorkOrderService } from '~~/server/services/work-order.real'

// W5-3 / ADR-0037: validate the date param at the boundary.
const QuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'date must be YYYY-MM-DD')
    .optional(),
})

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const services = await createRealServices(event)
  const current = await services.auth.currentUser()
  if (!current) {
    throw createError({ statusCode: 401, statusMessage: 'No active session' })
  }

  const parsedQuery = QuerySchema.safeParse(getQuery(event))
  if (!parsedQuery.success) {
    throw createError({ statusCode: 400, statusMessage: parsedQuery.error.message })
  }
  const dateStr = parsedQuery.data.date ?? new Date().toISOString().slice(0, 10)
  const from = new Date(`${dateStr}T00:00:00.000Z`)
  if (Number.isNaN(from.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid date' })
  }
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)

  // Construct the concrete real service so we can reach the new
  // listForFieldUser method (it is intentionally NOT on the shared
  // IWorkOrderService interface — see ADR-0029).
  const wo = services.workOrder as unknown as RealWorkOrderService
  const rows = await wo.listForFieldUser({
    organizationId: current.activeOrganizationId,
    userId: current.userId,
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  })

  return { rows, date: dateStr }
})

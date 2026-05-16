/**
 * server/api/homeowner/invoices/[id]/viewed.post.ts — emits
 * `homeowner.invoice_viewed` (W3-4 / W4-1 / EH-O). Mirrors the
 * sibling quotes/viewed handler — see that file for the decision
 * record.
 */
import { z } from 'zod'
import { createRealServices } from '~~/server/utils/services-factory'
import { emit } from '~~/shared/events/bus'
import { homeownerInvoiceViewed } from '~~/shared/events/catalog'

const InvoiceIdSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // W5-3 / ADR-0037: path params validated at the boundary.
  const parsed = InvoiceIdSchema.safeParse(getRouterParam(event, 'id') ?? '')
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid invoice id' })
  }
  const invoiceId = parsed.data

  const services = await createRealServices(event)
  const current = await services.auth.currentUser()
  const orgId = current?.activeOrganizationId
  if (!orgId) {
    throw createError({ statusCode: 401, statusMessage: 'No active organization' })
  }

  const invoice = await services.invoice.get(invoiceId, orgId)
  if (!invoice) {
    throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  }

  const memberships = await services.homeowner.listForUser(user.userId, orgId)
  const ok = memberships.some((m) => m.propertyId === invoice.propertyId)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
  }

  await emit(homeownerInvoiceViewed, {
    organizationId: orgId,
    entityId: invoice.id,
    actorUserId: user.userId,
    timestamp: new Date().toISOString(),
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
  })

  return { ok: true }
})

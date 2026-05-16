/**
 * server/api/homeowner/quotes/[id]/viewed.post.ts — emits the
 * `homeowner.quote_viewed` domain event when a homeowner opens a
 * quote detail page (W3-4 / W4-1 / EH-O).
 *
 * # Decisions
 *   - Server-side emission keeps the audit story honest (the client
 *     could spoof a direct emit; the server cross-checks tenant +
 *     homeowner membership first).
 *   - Tenant firewall via `createRealServices(event)` — the factory
 *     binds `organizationId` from the authenticated session, so the
 *     `.get()` call below cannot leak across orgs.
 *   - 404 (not 403) when the property is not in the homeowner's
 *     memberships, so we don't leak existence to a curious user.
 */
import { z } from 'zod'
import { createRealServices } from '~~/server/utils/services-factory'
import { emit } from '~~/shared/events/bus'
import { homeownerQuoteViewed } from '~~/shared/events/catalog'

const QuoteIdSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // W5-3 / ADR-0037: path params validated at the boundary.
  const parsed = QuoteIdSchema.safeParse(getRouterParam(event, 'id') ?? '')
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid quote id' })
  }
  const quoteId = parsed.data

  const services = await createRealServices(event)
  const current = await services.auth.currentUser()
  const orgId = current?.activeOrganizationId
  if (!orgId) {
    throw createError({ statusCode: 401, statusMessage: 'No active organization' })
  }

  const quote = await services.quote.get(quoteId, orgId)
  if (!quote) {
    throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
  }

  const memberships = await services.homeowner.listForUser(user.userId, orgId)
  const ok = memberships.some((m) => m.propertyId === quote.propertyId)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
  }

  await emit(homeownerQuoteViewed, {
    organizationId: orgId,
    entityId: quote.id,
    actorUserId: user.userId,
    timestamp: new Date().toISOString(),
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
  })

  return { ok: true }
})

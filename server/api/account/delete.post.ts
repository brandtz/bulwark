/**
 * server/api/account/delete.post.ts — DSR account-deletion endpoint
 * (W5-4 / Privacy + Compliance / ADR-0038).
 *
 * # What this file does
 *   - Soft-deletes the currently-authenticated user via
 *     `IAccountService.requestDeletion()`. On success, clears the
 *     server session so the next request is unauthenticated.
 *
 * # Decisions (ADR-0008, ADR-0038)
 *   - **Self-only.** No `userId` body parameter — we always read the
 *     active session. An admin "delete another user" path lives in
 *     the existing admin/user surface and stays out of scope.
 *   - **409 on sole-admin block.** The `SoleAdminError` thrown by
 *     the service maps to `409 Conflict` with `code: 'SOLE_ADMIN'`
 *     and a list of orphan org ids so the UI can render the
 *     transfer-ownership CTA.
 *   - **Session cleared on success.** `clearUserSession()` runs after
 *     soft-delete so the page's logout-on-success flow doesn't race a
 *     valid session against the now-deactivated user.
 */
import { createRealServices } from '~~/server/utils/services-factory'
import { SoleAdminError } from '~~/shared/contracts/account'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = (await readBody(event).catch(() => ({}))) as {
    reason?: string
  }

  const services = await createRealServices(event)
  try {
    const result = await services.account.requestDeletion({
      userId: user.userId,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    })
    await clearUserSession(event)
    return result
  } catch (err) {
    if (err instanceof SoleAdminError) {
      throw createError({
        statusCode: 409,
        statusMessage: err.message,
        data: { code: err.code, organizationIds: err.organizationIds },
      })
    }
    throw err
  }
})

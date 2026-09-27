/**
 * server/middleware/04.csrf.ts — double-submit CSRF gate (WP-L07 S1).
 * Policy and rationale live in server/utils/csrf.ts.
 */
import { checkCsrf, CSRF_COOKIE, internalRequestToken, newCsrfToken } from '../utils/csrf'
import { log } from '../utils/logger'

export default defineEventHandler(async (event) => {
  const cookies = parseCookies(event)
  if (!cookies[CSRF_COOKIE]) {
    const token = newCsrfToken()
    setCookie(event, CSRF_COOKIE, token, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' && process.env.NUXT_SESSION_COOKIE_SECURE !== 'false',
      httpOnly: false,
    })
  }
  // SSR-only: lets the app's server-side RPC calls identify themselves (see csrf.ts).
  event.context.bulwarkInternalToken = internalRequestToken()

  const url = event.node.req.url ?? '/'
  const path = url.split('?')[0] ?? url
  // Unseal the session only when the answer matters (unsafe API calls).
  const needsAuthState = path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(event.method)
  const authenticated = needsAuthState
    ? !!((await getUserSession(event)).user as { userId?: string } | undefined)?.userId
    : false
  const decision = checkCsrf({
    method: event.method,
    path,
    authenticated,
    cookies,
    headers: getRequestHeaders(event),
  })
  if (!decision.ok) {
    log('warn', 'security.csrf_rejected', { method: event.method, path, reason: decision.reason })
    throw createError({ statusCode: 403, statusMessage: decision.reason })
  }
})

/**
 * server/middleware/05.session-revocation.ts — signs out a revoked session on
 * its next API request (WP-X2, ED-015).
 *
 * The sealed cookie carries the user_sessions row id. When that row is revoked
 * (signed out elsewhere, "sign out other sessions", password change/reset) the
 * cookie is cleared here, before any handler reads it, so the RPC dispatcher
 * and the direct /api routes all see a signed-out caller. Cookies issued before
 * ED-015 carry no id and are left alone until they expire.
 */
import { isSessionRevoked } from '../services/session.real'
import type { SessionUserShape } from '../utils/services-factory'

export default defineEventHandler(async (event) => {
  const path = (event.node.req.url ?? '/').split('?')[0] ?? '/'
  if (!path.startsWith('/api/')) return
  if (!parseCookies(event)['nuxt-session']) return
  const user = (await getUserSession(event)).user as SessionUserShape | undefined
  if (!user?.userId || !user.sessionId) return
  if (await isSessionRevoked(user.sessionId, user.userId)) {
    await clearUserSession(event)
    deleteCookie(event, 'nuxt-session', { path: '/' })
    // h3 re-unseals the session from the request header on the next read in this
    // request, so drop the cookie from the incoming headers too.
    const header = event.node.req.headers.cookie ?? ''
    event.node.req.headers.cookie = header.split(';').filter((c) => c.trim().split('=')[0] !== 'nuxt-session').join(';')
  }
})

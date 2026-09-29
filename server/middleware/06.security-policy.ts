/**
 * server/middleware/06.security-policy.ts — applies the organization security
 * policy (required MFA, idle timeout; WP-L07 S2) to signed-in API routes that
 * do not go through the RPC dispatcher: storage presign/finalize, field
 * check-ins and my-day, account export/avatar/delete, homeowner "viewed" pings.
 *
 * The dispatcher (/api/services/**) enforces the same policy per method, so it
 * is skipped here. Bearer/cron, health and dev routes carry no user session.
 * Every other signed-in route is outside MFA_SETUP_ALLOWED: a member who has
 * not enrolled in a required-MFA org is refused (403) until they enrol.
 */
import { resolveSessionUser } from '../utils/services-factory'
import { enforceSecurityPolicy } from '../utils/security-enforcement'

const SKIP = [/^\/api\/services\//, /^\/api\/health(\/|$)/, /^\/api\/ready$/, /^\/api\/metrics$/, /^\/api\/jobs\//, /^\/api\/_dev\//, /^\/api\/_auth\//]

export default defineEventHandler(async (event) => {
  const path = (event.node.req.url ?? '/').split('?')[0] ?? '/'
  if (!path.startsWith('/api/') || SKIP.some((re) => re.test(path))) return
  if (!parseCookies(event)['nuxt-session']) return
  const session = await resolveSessionUser(event)
  if (!session?.userId) return
  await enforceSecurityPolicy(event, `route:${event.method} ${path}`, session)
})

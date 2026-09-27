/**
 * app/middleware/mfa-required.global.ts — send members who must enrol in MFA
 * to /profile/security (WP-L07 S2).
 *
 * Runs on SSR and client so the first page load redirects too. The server is
 * the real gate (the RPC dispatcher refuses everything but the enrolment
 * path); this only routes the user to where they can fix it. The status is
 * cached per signed-in user and cleared once they enrol.
 */
const ALLOWED = ['/profile/security', '/login', '/logout', '/forgot-password', '/reset-password', '/accept-invite', '/goodbye', '/403']

export default defineNuxtRouteMiddleware(async (to) => {
  if (ALLOWED.some((path) => to.path === path || to.path.startsWith(`${path}/`))) return
  const { session } = useSession()
  const userId = session.value?.userId
  if (!userId) return

  const status = useState<{ userId: string, required: boolean } | null>('bulwark.mfaRequired', () => null)
  if (status.value?.userId !== userId || status.value.required) {
    try {
      const mine = await useService('securityPolicy').getMine()
      status.value = { userId, required: mine.mfaEnrollmentRequired }
    } catch {
      return // never lock users out of navigation because the status call failed
    }
  }
  if (status.value?.required) {
    return navigateTo({ path: '/profile/security', query: { required: '1', next: to.fullPath } })
  }
})

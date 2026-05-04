/**
 * app/composables/useSession.ts — current user + active org.
 *
 * Wraps useService('auth').currentUser() and caches it across the page tree
 * via Nuxt's useState. UI components call this any time they need to know
 * "who am I and which org am I in?"
 *
 * Decisions NOT taken:
 *   - We do NOT auto-login. The plugin (E0-S6) defaults to FIXTURE_USER_ADMIN
 *     in the mock so you can develop without seeing a login screen yet, but
 *     `useSession()` still goes through the contract — when the real /login
 *     page lands in E2-S1 the same composable serves it.
 */
import type { SessionUser } from '~~/shared/contracts/auth'

export function useSession() {
  const session = useState<SessionUser | null>('bulwark.session', () => null)

  async function refresh(): Promise<void> {
    const auth = useService('auth')
    session.value = await auth.currentUser()
  }

  async function ensureLoaded(): Promise<void> {
    if (session.value === null) await refresh()
  }

  return { session, refresh, ensureLoaded }
}

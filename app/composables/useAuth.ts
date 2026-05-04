/**
 * app/composables/useAuth.ts — login / logout / session orchestration.
 *
 * Why this file exists
 * --------------------
 * `useSession()` is a passive read-side primitive — UI just asks "who am I?".
 * Mutating side (login form submit, top-bar Sign Out, post-invite handshake)
 * needs its own composable so we can unit-test the flow in isolation and
 * so /login.vue and AppTopBar.vue don't both reach into MockAuthService
 * directly. Both go through useAuth().
 *
 * Decisions
 * ---------
 * - **No automatic redirect inside login()**. The page calling login owns
 *   the "where to go after success" logic (it knows about ?next=). This
 *   keeps the composable testable without spying on the router.
 * - **logout() DOES navigate to /login**. The opposite choice would force
 *   every Sign Out caller to remember the redirect; one place < many.
 * - **Returned `loading` is a ref, not local state**: callers may want to
 *   disable a button while pending — they need reactivity.
 * - **error is the *message string***, not Error/Zod issues, because
 *   the demo's auth UX is intentionally simple (one banner, one line).
 *   E11-S2 may upgrade to field-level errors when real backend returns them.
 */
import type {
  LoginInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  AcceptInviteInput,
  InvitePreview,
} from '~~/shared/contracts/auth'

export function useAuth() {
  const { session, refresh } = useSession()
  const loading = useState<boolean>('bulwark.auth.loading', () => false)
  const error = useState<string | null>('bulwark.auth.error', () => null)

  async function login(input: LoginInput): Promise<boolean> {
    const auth = useService('auth')
    loading.value = true
    error.value = null
    try {
      await auth.login(input)
      await refresh()
      return true
    } catch (e: unknown) {
      // Mock backend never throws today, but RealAuthService will. Normalise.
      error.value = e instanceof Error ? e.message : 'Sign in failed'
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    const auth = useService('auth')
    await auth.logout()
    await refresh()
    await navigateTo('/login')
  }

  // --- Password reset (E2-S2) -------------------------------------------
  async function requestPasswordReset(
    input: RequestPasswordResetInput,
  ): Promise<{ ok: boolean; devToken: string | null }> {
    const auth = useService('auth')
    loading.value = true
    error.value = null
    try {
      const r = await auth.requestPasswordReset(input)
      return { ok: true, devToken: r.devToken }
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Could not send reset link'
      return { ok: false, devToken: null }
    } finally {
      loading.value = false
    }
  }

  async function resetPassword(input: ResetPasswordInput): Promise<boolean> {
    const auth = useService('auth')
    loading.value = true
    error.value = null
    try {
      await auth.resetPassword(input)
      await refresh()
      return true
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Reset failed'
      return false
    } finally {
      loading.value = false
    }
  }

  // --- Invitations (E2-S2) ---------------------------------------------
  async function previewInvite(token: string): Promise<InvitePreview | null> {
    const auth = useService('auth')
    error.value = null
    try {
      return await auth.previewInvite(token)
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Invitation invalid'
      return null
    }
  }

  async function acceptInvite(input: AcceptInviteInput): Promise<boolean> {
    const auth = useService('auth')
    loading.value = true
    error.value = null
    try {
      await auth.acceptInvite(input)
      await refresh()
      return true
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Could not accept invite'
      return false
    } finally {
      loading.value = false
    }
  }

  // E2-S4: org switcher — pick a different membership and persist it.
  async function switchActiveOrg(organizationId: string): Promise<boolean> {
    const auth = useService('auth')
    loading.value = true
    error.value = null
    try {
      await auth.switchActiveOrg(organizationId)
      await refresh()
      return true
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Could not switch organization'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    session,
    loading,
    error,
    login,
    logout,
    requestPasswordReset,
    resetPassword,
    previewInvite,
    acceptInvite,
    switchActiveOrg,
  }
}

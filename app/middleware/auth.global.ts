/**
 * app/middleware/auth.global.ts — gatekeeps the app shell.
 *
 * Behaviour
 * ---------
 * - If user has a session → allow.
 * - If route is in PUBLIC_ROUTES → allow.
 * - Otherwise → redirect to `/login?next=<encoded current path>`.
 *
 * Decisions
 * ---------
 * - **Global middleware** (not page-level) so a developer cannot accidentally
 *   ship a page without auth coverage. The decision cast down: per-page
 *   `definePageMeta({ middleware: 'auth' })` — error-prone and not greppable.
 * - **`/dev/*` is public** (only available in dev anyway). Keeps the UI
 *   playground accessible in tests without forcing a login flow on every spec.
 * - **403 / role checks happen elsewhere** (E2-S4 role middleware). This
 *   middleware only answers "are you signed in at all?".
 * - We DO NOT call `ensureLoaded()` here on every nav — too chatty. The
 *   layout's onBeforeMount calls it once; this middleware just reads the
 *   already-populated `session` ref.
 */
const PUBLIC_ROUTES: ReadonlyArray<string | RegExp> = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  '/403',
  /^\/dev(\/|$)/,
  /^\/_/,
]

function isPublic(path: string): boolean {
  return PUBLIC_ROUTES.some((p) => (typeof p === 'string' ? p === path : p.test(path)))
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (isPublic(to.path)) return

  const { session, ensureLoaded } = useSession()
  if (session.value === null) {
    // Hydrate once: SSR may not have populated yet on first nav.
    await ensureLoaded()
  }
  if (session.value) return

  // Not signed in — bounce to /login, preserving where they wanted to go.
  // `redirectCode: 302` forces a real HTTP redirect on the SSR path so the
  // browser's URL bar updates. Without it, Nuxt would render the /login
  // template at status 200 with the original URL still in the address bar
  // (which Playwright's URL assertions correctly flag as a regression).
  const next = to.fullPath !== '/' ? `?next=${encodeURIComponent(to.fullPath)}` : ''
  return navigateTo(`/login${next}`, { redirectCode: 302 })
})

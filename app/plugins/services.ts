/**
 * app/plugins/services.ts — wires the BulwarkServices factory into Nuxt.
 *
 * Pages call `const { $services } = useNuxtApp()` or the `useService(name)`
 * helper composable (app/composables/useService.ts). ADR-0004.
 *
 * Decisions:
 *   - We resolve the factory ONCE at plugin init based on runtimeConfig
 *     (`useRuntimeConfig().public.backend`). This means flipping the env
 *     var requires a restart, which is fine for the mock-vs-real split.
 *
 * Decisions NOT taken:
 *   - We do NOT support per-domain mock-vs-real toggling at runtime. E11-S1
 *     introduces a build-time feature flag for partial rollouts (e.g.
 *     property=real, quote=mock during migration); that's a different
 *     mechanism than this plugin.
 */
import { createMockServices } from '~~/shared/mocks/factory'
import type { BulwarkServices } from '~~/shared/contracts/services'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const backend = config.public.backend

  let services: BulwarkServices
  if (backend === 'real') {
    // E11-S1 will replace this throw with createRealServices().
    throw new Error('[bulwark] BULWARK_BACKEND=real is not yet supported. Set BULWARK_BACKEND=mock until E11.')
  } else {
    /*
     * Cookie-backed adapter so SSR + client + middleware all read the same
     * "who's signed in?" state.
     *
     * Decision (revised in E2-S1): NO default value. The earlier
     * `default: 'drew@bulwark.demo'` was a tempting dev DX shortcut, but it
     * meant logout could not actually sign anyone out — every subsequent
     * request hit the missing-cookie code path and re-defaulted to admin.
     * The dev shortcut moved to /login (the persona quick-pick block).
     *
     * Decision cast down: storing a JSON-encoded SessionUser in the cookie.
     * Rejected — fixture data is small and the email key is enough to
     * rehydrate. Cookie size stays tiny and we don't ship internal IDs.
     *
     * Note: useCookie() is called per-method-invocation rather than once,
     * so each request resolves its own cookie ref. Caching the ref at
     * factory time would leak across requests on SSR.
     */
    const COOKIE = 'bulwark.mock.persona'
    const ORG_COOKIE = 'bulwark.mock.activeOrg'
    services = createMockServices({
      getActivePersonaEmail: () => useCookie<string | null>(COOKIE, { sameSite: 'lax' }).value ?? null,
      setActivePersonaEmail: (email) => {
        useCookie<string | null>(COOKIE, { sameSite: 'lax' }).value = email
      },
      // E2-S4: per-session active-org override. Null = use the user's
      // default activeOrganizationId (their first membership).
      getActiveOrgOverride: () => useCookie<string | null>(ORG_COOKIE, { sameSite: 'lax' }).value ?? null,
      setActiveOrgOverride: (orgId) => {
        useCookie<string | null>(ORG_COOKIE, { sameSite: 'lax' }).value = orgId
      },
    })
  }

  return {
    provide: { services },
  }
})

declare module '#app' {
  interface NuxtApp {
    $services: BulwarkServices
  }
}

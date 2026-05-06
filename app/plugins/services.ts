/**
 * app/plugins/services.ts — wires the BulwarkServices factory into Nuxt.
 *
 * Pages call `const { $services } = useNuxtApp()` or the `useService(name)`
 * helper composable (app/composables/useService.ts). ADR-0004.
 *
 * # Decisions (E11-S13)
 *   - Mock backend: in-process factory, cookie-backed persona adapter.
 *   - Real backend: a tiny RPC proxy. Every method dispatches to
 *     `POST /api/services/[service]/[method]` with the input as the
 *     body. The server side runs `createRealServices(event)` which
 *     does the actual DB work.
 *   - Plugin runs both server + client. To avoid pulling Drizzle/pg
 *     into the client bundle, we NEVER import the real factory here —
 *     the proxy talks HTTP. On SSR, Nuxt's `$fetch` short-circuits to
 *     in-memory dispatch, so there's no real network round-trip.
 *
 * # Decision cast down
 *   - Per-domain mock-vs-real toggling at runtime. Rejected — flipping
 *     the env var requires a restart, which is fine for the mock-vs-
 *     real split. A finer-grained flag would multiply the test matrix.
 */
import { createMockServices } from '~~/shared/mocks/factory'
import type { BulwarkServices, ServiceName } from '~~/shared/contracts/services'

interface FetchErrorShape {
  data?: { statusMessage?: string; message?: string }
  statusMessage?: string
  message?: string
}

function unwrapFetchError(err: unknown): never {
  const e = err as FetchErrorShape
  const msg = e?.data?.statusMessage ?? e?.data?.message ?? e?.statusMessage ?? e?.message ?? 'Request failed'
  throw new Error(msg)
}

function makeRpcProxy(): BulwarkServices {
  const cache = new Map<string, unknown>()
  // On SSR, plain $fetch does NOT forward the incoming request's cookies
  // to internal API calls. useRequestFetch() returns a fetch wrapper that
  // does, so the nuxt-session cookie reaches /api/services/auth/currentUser
  // during SSR navigation. On the client this is a no-op (just returns $fetch).
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch
  return new Proxy({} as BulwarkServices, {
    get(_target, prop: string) {
      if (cache.has(prop)) return cache.get(prop)
      const serviceName = prop as ServiceName
      const serviceProxy = new Proxy({} as Record<string, unknown>, {
        get(_t2, methodName: string) {
          return async (input?: unknown) => {
            try {
              return await requestFetch(`/api/services/${String(serviceName)}/${methodName}`, {
                method: 'POST',
                body: input === undefined ? {} : input,
              })
            } catch (err) {
              unwrapFetchError(err)
            }
          }
        },
      })
      cache.set(prop, serviceProxy)
      return serviceProxy
    },
  })
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const backend = config.public.backend

  let services: BulwarkServices
  if (backend === 'real') {
    services = makeRpcProxy()
  } else {
    /*
     * Cookie-backed adapter so SSR + client + middleware all read the same
     * "who's signed in?" state. No default email — each persona switch
     * writes the cookie explicitly. See E2-S1 / login.vue persona block.
     */
    const COOKIE = 'bulwark.mock.persona'
    const ORG_COOKIE = 'bulwark.mock.activeOrg'
    services = createMockServices({
      getActivePersonaEmail: () => useCookie<string | null>(COOKIE, { sameSite: 'lax' }).value ?? null,
      setActivePersonaEmail: (email) => {
        useCookie<string | null>(COOKIE, { sameSite: 'lax' }).value = email
      },
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

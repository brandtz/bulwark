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
    services = createMockServices()
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

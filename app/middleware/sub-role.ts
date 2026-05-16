/**
 * app/middleware/sub-role.ts — gate routes under the subcontractor
 * portal (W3-4 / EH-N / ADR-0031).
 *
 * # Decisions
 *   - Mirrors `field-role.ts`: named (not global) middleware, opted
 *     into by individual /sub pages via `definePageMeta`.
 *   - Only requires the `sub_contractor` role. The deeper check
 *     (`resolveSubForUser` returning a non-null subcontractor row)
 *     happens on the server when each service call asserts tenant
 *     scope; we do NOT call the service from middleware to avoid an
 *     SSR round-trip on every navigation.
 *   - auth.global.ts has already proved a session exists.
 */
import type { Role } from '~~/shared/contracts/_shared'

const SUB_ROLES: ReadonlyArray<Role> = ['sub_contractor']

export default defineNuxtRouteMiddleware((to) => {
  const { session } = useSession()
  const role = session.value?.activeRole

  if (!role) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`, {
      redirectCode: 302,
    })
  }

  if (!SUB_ROLES.includes(role)) {
    return navigateTo('/403', { redirectCode: 302 })
  }
})

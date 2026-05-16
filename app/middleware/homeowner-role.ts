/**
 * app/middleware/homeowner-role.ts — gate routes under the homeowner
 * portal (W3-4 / EH-O / ADR-0032).
 *
 * # Decisions
 *   - Mirrors `sub-role.ts` / `field-role.ts`: named (not global),
 *     opted into via `definePageMeta({ middleware: 'homeowner-role' })`.
 *   - Only requires the `homeowner` role. Per-property scoping is
 *     enforced server-side by the homeowner service (`listForUser`)
 *     and by the standard tenant firewall.
 */
import type { Role } from '~~/shared/contracts/_shared'

const HOMEOWNER_ROLES: ReadonlyArray<Role> = ['homeowner']

export default defineNuxtRouteMiddleware((to) => {
  const { session } = useSession()
  const role = session.value?.activeRole

  if (!role) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`, {
      redirectCode: 302,
    })
  }

  if (!HOMEOWNER_ROLES.includes(role)) {
    return navigateTo('/403', { redirectCode: 302 })
  }
})

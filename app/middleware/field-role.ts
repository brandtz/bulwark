/**
 * app/middleware/field-role.ts — gate routes under the field surface
 * (W3-3 / EH-M / ADR-0029).
 *
 * # Decisions (ADR-0008)
 *   - Named middleware (not global) — only field-prefixed routes opt in
 *     via `definePageMeta({ middleware: 'field-role' })`. Existing
 *     `app/middleware/role.ts` already enforces `requiredRoles`; this
 *     middleware is a thin convenience wrapper that hardcodes the
 *     `field` role list so the new W3-3 pages don't have to repeat the
 *     `ROLE_GROUPS.field` import.
 *   - The decision cast down was to apply this globally to `/field/*`
 *     via a global middleware. Rejected: the existing E10 field pages
 *     already use `requiredRoles: ROLE_GROUPS.field` + the `role`
 *     middleware. Stacking a global gate would double-fire and couples
 *     the auth layer to a path prefix.
 *
 * # Behaviour
 *   - auth.global.ts has already proved a session exists by the time
 *     this fires (same precondition as `role.ts`).
 *   - If the user's `activeRole` is not `field` → bounce to /403.
 *   - Field-role users with the wrong active org get the same 403; org
 *     selection happens elsewhere (org-switcher).
 */
import type { Role } from '~~/shared/contracts/_shared'

const FIELD_ROLES: ReadonlyArray<Role> = ['field']

export default defineNuxtRouteMiddleware((to) => {
  const { session } = useSession()
  const role = session.value?.activeRole

  if (!role) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`, {
      redirectCode: 302,
    })
  }

  if (!FIELD_ROLES.includes(role)) {
    return navigateTo('/403', { redirectCode: 302 })
  }
})

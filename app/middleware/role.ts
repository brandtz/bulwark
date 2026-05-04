/**
 * middleware/role.ts — named middleware that enforces page-meta `requiredRoles`.
 *
 * # Decisions (ADR-0008)
 *
 * - **Named (not global) middleware**: applied per-page via
 *   `definePageMeta({ middleware: ['role'], requiredRoles: [...] })`.
 *   Auth.global.ts already runs first to verify a session exists; this
 *   layer only fires once we know there's a logged-in user, so we can
 *   trust `useSession()` here.
 * - **Reads the role list from the destination page's meta** (`to.meta`).
 *   This means each protected page declares its own list inline, making
 *   the policy visible at the call-site rather than buried in a giant
 *   middleware switch statement.
 * - **Empty / missing `requiredRoles` is a no-op**: pages that *want* the
 *   middleware to enforce something always declare a list; pages that
 *   accidentally include `'role'` middleware without a list don't 500.
 *
 * # Decision cast down
 *
 * - **Inline `role` checks at the top of each page's `<script setup>`**.
 *   Rejected: a runtime check after the page has already started
 *   rendering means the wrong-role user briefly sees the page chrome
 *   before the redirect lands. Middleware fires *before* render.
 * - **One global middleware that knows about every route**. Rejected:
 *   couples the auth layer to the route registry; adding a new admin
 *   page would require editing both the page and the middleware.
 */

import type { Role } from '~~/shared/contracts/_shared'

export default defineNuxtRouteMiddleware((to) => {
  const required = (to.meta.requiredRoles as Role[] | undefined) ?? []
  if (required.length === 0) return

  const { session } = useSession()
  const role = session.value?.activeRole

  // No session here means auth.global.ts didn't catch them — defensive
  // double-check rather than trust the global to have run.
  if (!role) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`, {
      redirectCode: 302,
    })
  }

  if (!required.includes(role)) {
    return navigateTo('/403', { redirectCode: 302 })
  }
})

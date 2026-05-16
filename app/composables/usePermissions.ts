/**
 * composables/usePermissions.ts — role-based access checks (E2-S3).
 *
 * # Decisions (ADR-0008)
 *
 * - **Pure derivation from `useSession`**: this composable owns no state of
 *   its own. All checks read `session.value?.activeRole` — single source of
 *   truth.  Makes the composable safe to call anywhere (templates,
 *   middleware, services) without worrying about reactivity races.
 * - **Role groups, not raw role strings, in pages**: pages declare
 *   `definePageMeta({ requiredRoles: ['org_admin', 'super_admin'] })` (or
 *   one of the named groups below). This keeps page meta readable and
 *   centralizes the "who's allowed" answer in this file.
 * - **`hasAnyRole(...)` as the primary primitive**: every higher-level
 *   helper composes from it, so when E11 ships permission scopes (not just
 *   roles) we replace one function and keep the API stable.
 *
 * # Decision cast down
 *
 * - **Per-resource policy objects (CASL-style)**. Rejected for v1:
 *   we don't have row-level rules yet (those land in E2-S6 tenant
 *   firewall + E11 real backend). Roles are sufficient for routing.
 * - **Putting role checks in `auth.global.ts`**. Rejected: keeping the
 *   *global* middleware focused on "are you logged in?" and a *named*
 *   `role` middleware focused on "are you the right kind?" is easier to
 *   reason about and test.
 */

import type { Role } from '~~/shared/contracts/_shared'

// Convenience role groups — keep in sync with the page meta consumers.
export const ROLE_GROUPS = {
  /** Anyone who can administer an organization. */
  admin: ['super_admin', 'org_admin', 'org_manager'] as Role[],
  /** Org-level managers + admins (NOT super_admin — that's platform staff). */
  orgManagement: ['org_admin', 'org_manager'] as Role[],
  /** Field workers — boots-on-the-ground UI. */
  field: ['field'] as Role[],
  /** Subcontractor partners. */
  sub: ['sub_contractor'] as Role[],
  /** Homeowner / customer portal users. */
  homeowner: ['homeowner'] as Role[],
  /** Read-only auditor / insurance reviewer. */
  viewer: ['viewer'] as Role[],
  /** Admin OR field — used by shared screens like property detail. */
  adminOrField: ['super_admin', 'org_admin', 'org_manager', 'field'] as Role[],
}

export function usePermissions() {
  const { session } = useSession()

  function hasAnyRole(...roles: Role[]): boolean {
    const r = session.value?.activeRole
    if (!r) return false
    return roles.includes(r)
  }

  function isAdmin(): boolean {
    return hasAnyRole(...ROLE_GROUPS.admin)
  }

  function isField(): boolean {
    return hasAnyRole(...ROLE_GROUPS.field)
  }

  function isSub(): boolean {
    return hasAnyRole(...ROLE_GROUPS.sub)
  }

  function isHomeowner(): boolean {
    return hasAnyRole(...ROLE_GROUPS.homeowner)
  }

  function isSuperAdmin(): boolean {
    return hasAnyRole('super_admin')
  }

  return {
    session,
    hasAnyRole,
    isAdmin,
    isField,
    isSub,
    isHomeowner,
    isSuperAdmin,
  }
}

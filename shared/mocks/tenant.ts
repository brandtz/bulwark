/**
 * shared/mocks/tenant.ts — TenantContext + cross-tenant firewall (E2-S7).
 *
 * # Decisions (ADR-0008)
 *   - Every domain mock service receives a `TenantResolver` closure at
 *     construction. Before any data access that takes an `organizationId`
 *     input, the mock calls `assertSameTenant(resolver, input.organizationId)`
 *     which throws `TenantViolationError` if the caller is reaching across
 *     tenants. This is the *firewall* the real backend will mirror via
 *     server-side session checks.
 *   - The resolver returns `null` when there is no signed-in session
 *     (e.g. unit tests that construct a mock directly without a context,
 *     or pre-auth bootstrap requests). In that case we skip the check —
 *     auth-required pages already redirect to /login via `auth.global`.
 *     The firewall is defense-in-depth, NOT the primary auth gate.
 *   - We use a custom `TenantViolationError` subclass so unit + integration
 *     tests can assert the specific failure mode (instead of any Error).
 *
 * # Decision cast down
 *   - Rejected: changing every service method signature to take an explicit
 *     `ctx: TenantContext` argument. That ripples through every call site
 *     and contract; the resolver pattern keeps the existing
 *     `IPropertyService` / `IClientService` shapes untouched while still
 *     enforcing the cross-tenant invariant.
 *   - Rejected: implementing the firewall as a Proxy wrapper around each
 *     mock. That works but obscures the check from anyone reading the
 *     mock implementation; an explicit `assertSameTenant` call at the top
 *     of each method is louder and easier to audit.
 */

export type TenantContext = {
  userId: string
  organizationId: string
}

export type TenantResolver = () => TenantContext | null

export class TenantViolationError extends Error {
  constructor(public readonly ctxOrganizationId: string, public readonly requestedOrganizationId: string) {
    super(
      `Tenant firewall: session organization ${ctxOrganizationId} cannot access ${requestedOrganizationId}`,
    )
    this.name = 'TenantViolationError'
  }
}

/**
 * Throws `TenantViolationError` if the caller is asking for data from a
 * different organization than the one bound to the active session. A null
 * resolver (or one that returns null) is treated as "no context" and the
 * call is allowed — see the Decisions block above.
 */
export function assertSameTenant(
  resolver: TenantResolver | undefined,
  requestedOrganizationId: string,
): void {
  const ctx = resolver?.()
  if (!ctx) return
  if (ctx.organizationId !== requestedOrganizationId) {
    throw new TenantViolationError(ctx.organizationId, requestedOrganizationId)
  }
}

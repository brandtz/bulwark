/**
 * server/services/_tenant.ts — re-export of the tenant firewall primitives.
 *
 * # Decisions (ADR-0008)
 *   - The firewall lives in `shared/mocks/tenant.ts` because (a) it's a
 *     pure utility with no mock state and (b) E2-S7 originally introduced
 *     it for the mocks. Real services reuse the same primitives so the
 *     enforcement model is identical across both backends — a single
 *     `assertSameTenant` call site with a closure-style resolver.
 *   - Re-exporting from `server/services/` keeps the import path inside
 *     each Real service short and signals intent: "this file is using
 *     the cross-tenant firewall."
 */
export { assertSameTenant, TenantViolationError } from '../../shared/mocks/tenant'
export type { TenantContext, TenantResolver } from '../../shared/mocks/tenant'

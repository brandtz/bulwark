/**
 * shared/mocks/factory.ts — MockServiceFactory.
 *
 * Returns a BulwarkServices object wired entirely to mock impls. The Nuxt
 * plugin (app/plugins/services.ts) uses this when BULWARK_BACKEND=mock.
 *
 * # Decisions (ADR-0004 / ADR-0008)
 *   - Singletons per process. The MockPropertyService keeps state in a
 *     module-level array; constructing two instances would duplicate state.
 *     Using `cachedServices` ensures `useService()` always returns the same
 *     instance.
 *   - E2-S7 tenant firewall: the factory accepts an optional
 *     `TenantResolver` and forwards it to every domain mock. The resolver
 *     is a closure that re-reads the current session on each call, so even
 *     though the services themselves are cached singletons, the org check
 *     happens against the *current* SSR/CSR request context.
 *
 * # Decision cast down
 *   - Rejected: caching a TenantContext value on the service. That would
 *     bind the very first request's org id to the singleton forever and
 *     break super_admin org-switching. The resolver MUST be a closure.
 */
import type { BulwarkServices } from '../contracts/services'
import { MockAuthService, type MockAuthSessionAdapter } from './auth.mock'
import { MockPropertyService } from './property.mock'
import { MockClientService } from './client.mock'
import { MockAssessmentService } from './assessment.mock'
import { MockQuoteService } from './quote.mock'
import { MockSubcontractorService } from './subcontractor.mock'
import { MockWorkOrderService } from './work-order.mock'
import { MockJobService } from './job.mock'
import { MockComplianceDocService } from './compliance.mock'
import { MockInvoiceService } from './invoice.mock'
import type { TenantResolver } from './tenant'

let cachedServices: BulwarkServices | null = null

export function createMockServices(
  authAdapter: MockAuthSessionAdapter,
  tenantResolver?: TenantResolver,
): BulwarkServices {
  if (!cachedServices) {
    const auth = new MockAuthService(authAdapter)
    // Default resolver pulls the active session synchronously from auth.
    // Callers (e.g. unit tests) can pass an explicit resolver to override.
    const resolver: TenantResolver = tenantResolver ?? (() => auth.resolveTenantSync())
    const job = new MockJobService(resolver)
    cachedServices = {
      auth,
      property: new MockPropertyService(resolver),
      client: new MockClientService(resolver),
      assessment: new MockAssessmentService(resolver),
      quote: new MockQuoteService(resolver),
      subcontractor: new MockSubcontractorService(resolver),
      workOrder: new MockWorkOrderService(resolver),
      job,
      complianceDoc: new MockComplianceDocService(resolver, () => job),
      invoice: new MockInvoiceService(resolver),
    }
  }
  return cachedServices
}

/**
 * Test-only escape hatch: clears the cached singleton so each test gets a
 * fresh factory with its own resolver. Production code never calls this.
 */
export function __resetMockServicesForTests(): void {
  cachedServices = null
}


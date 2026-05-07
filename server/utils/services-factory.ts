/**
 * server/utils/services-factory.ts — h3 BulwarkServices factory (E11-S13).
 *
 * # Decisions (ADR-0004, ADR-0008, ADR-0012)
 *   - Per-request factory: every API call builds a fresh BulwarkServices
 *     instance bound to the request's `H3Event`. Service classes
 *     themselves are stateless aside from the `tenantResolver`/`adapter`
 *     captured at construction.
 *   - Tenant snapshot: we resolve the active session ONCE per request
 *     (via `RealAuthService.currentUser()`) and freeze it into a
 *     synchronous `TenantResolver`. The mock contract demands a sync
 *     resolver; making it async would ripple through every service
 *     method. If a method mutates the session mid-request (login,
 *     switchActiveOrg) the resolver still returns the pre-call
 *     snapshot, but those auth methods don't take an `organizationId`
 *     so they bypass tenant checks anyway.
 *   - Auth session adapter: the H3 adapter writes through
 *     `setUserSession` / `clearUserSession` (nuxt-auth-utils). Cookie
 *     persistence is the module's job, not ours.
 *
 * # Decision cast down
 *   - Caching the factory on the event. Rejected — the construction
 *     cost is two cheap allocations per service plus one DB round-trip
 *     for `currentUser`. Caching adds invalidation surface for no real
 *     win.
 */
// H3Event + nuxt-auth-utils session helpers are Nitro auto-import globals
// (see .nuxt/types/nitro-imports.d.ts). Importing them explicitly fights
// the build, so we let the ambient declarations supply both runtime and
// types.
import type { BulwarkServices } from '../../shared/contracts/services'
import { RealAuthService, type RealAuthSessionAdapter } from '../services/auth.real'
import { RealPropertyService } from '../services/property.real'
import { RealClientService } from '../services/client.real'
import { RealAssessmentService } from '../services/assessment.real'
import { RealQuoteService } from '../services/quote.real'
import { RealSubcontractorService } from '../services/subcontractor.real'
import { RealWorkOrderService } from '../services/work-order.real'
import { RealJobService } from '../services/job.real'
import { RealComplianceDocService } from '../services/compliance.real'
import { RealInvoiceService } from '../services/invoice.real'
import { RealStandardsService } from '../services/standards.real'
import { RealApiKeyService } from '../services/api-key.real'
import type { TenantContext, TenantResolver } from '../services/_tenant'

interface SessionUserShape {
  userId?: string
  activeOrgOverride?: string | null
}

type Event = InstanceType<typeof H3Event>

class H3AuthSessionAdapter implements RealAuthSessionAdapter {
  constructor(private readonly event: Event) {}

  async getActiveUserId(): Promise<string | null> {
    const s = await getUserSession(this.event)
    return (s.user as SessionUserShape | undefined)?.userId ?? null
  }

  async setActiveUserId(id: string | null): Promise<void> {
    if (id === null) {
      await clearUserSession(this.event)
      // Belt-and-suspenders: clearUserSession sets Set-Cookie to expire the
      // session, but in some response paths the browser keeps the cookie if
      // attributes don't exactly match. Explicitly delete on the same path
      // and SameSite so the browser drops it.
      deleteCookie(this.event, 'nuxt-session', { path: '/' })
      return
    }
    const s = await getUserSession(this.event)
    const prev = (s.user ?? {}) as SessionUserShape
    await setUserSession(this.event, { user: { ...prev, userId: id } })
  }

  async getActiveOrgOverride(): Promise<string | null> {
    const s = await getUserSession(this.event)
    return (s.user as SessionUserShape | undefined)?.activeOrgOverride ?? null
  }

  async setActiveOrgOverride(id: string | null): Promise<void> {
    const s = await getUserSession(this.event)
    if (!s.user) return
    const prev = s.user as SessionUserShape
    await setUserSession(this.event, { user: { ...prev, activeOrgOverride: id } })
  }
}

export async function createRealServices(event: Event): Promise<BulwarkServices> {
  const adapter = new H3AuthSessionAdapter(event)
  const auth = new RealAuthService(adapter)

  // Snapshot the active tenant ONCE per request (sync resolver contract).
  let snapshot: TenantContext | null = null
  try {
    const session = await auth.currentUser()
    if (session) {
      snapshot = {
        userId: session.userId,
        organizationId: session.activeOrganizationId,
      }
    }
  } catch {
    // No session / DB miss — leave snapshot null, mirrors the mock
    // behaviour where a null resolver skips the firewall (defense in
    // depth, not the primary auth gate).
    snapshot = null
  }
  const tenantResolver: TenantResolver = () => snapshot

  return {
    auth,
    property: new RealPropertyService(tenantResolver),
    client: new RealClientService(tenantResolver),
    assessment: new RealAssessmentService(tenantResolver),
    quote: new RealQuoteService(tenantResolver),
    subcontractor: new RealSubcontractorService(tenantResolver),
    workOrder: new RealWorkOrderService(tenantResolver),
    job: new RealJobService(tenantResolver),
    complianceDoc: new RealComplianceDocService(tenantResolver),
    invoice: new RealInvoiceService(tenantResolver),
    standards: new RealStandardsService(tenantResolver),
    apiKey: new RealApiKeyService(tenantResolver),
  }
}

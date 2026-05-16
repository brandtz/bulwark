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
import { RealProgramService } from '../services/program.real'
import { RealLabelService } from '../services/label.real'
import { RealAuditService } from '../services/audit.real'
import { RealStatusPipelineService } from '../services/status-pipeline.real'
import { RealTradeService } from '../services/trade.real'
import { RealOrgSettingsService } from '../services/org-settings.real'
import { RealInspectionTemplateService } from '../services/inspection-template.real'
import { RealInspectionService } from '../services/inspection.real'
// W2-4 / EH-H Part B (ADR-0021/0022) — admin hub: users, flags, providers,
// webhooks, notification preferences.
import { RealUserService } from '../services/user.real'
import { RealFeatureFlagService } from '../services/feature-flag.real'
import { RealProviderConfigService } from '../services/provider-config.real'
import { RealWebhookService } from '../services/webhook.real'
import { RealNotificationSubscriptionService } from '../services/notification-subscription.real'
import { RealInvoicePaymentService } from '../services/invoice-payment.real'
import { RealChangeOrderService } from '../services/change-order.real'
// W2-5 / EH-I (ADR-0024/25) — auth hardening: MFA + permission overrides.
import { RealMfaService } from '../services/mfa.real'
import { RealPermissionService } from '../services/permission.real'
// W2-1 / EH-E (ADR-0018) — property depth.
import { RealBuildingService } from '../services/building.real'
import { RealContactService } from '../services/contact.real'
import { RealPropertyPhotoService } from '../services/property-photo.real'
import { RealPropertyAttachmentService } from '../services/property-attachment.real'
// W3-1 / EH-J (ADR-0027) — in-app notification feed.
import { RealNotificationService } from '../services/notification.real'
// W3-4 / EH-O (ADR-0032) — homeowner portal.
import { RealHomeownerService } from '../services/homeowner.real'
// W3-2 / EH-K (ADR-0030) — reporting + dashboards.
import { RealReportingService } from '../services/reporting.real'
// W3-5 / EH-P (ADR-0033) — global search + saved list views.
import { RealSearchService } from '../services/search.real'
import { RealSavedViewService } from '../services/saved-view.real'
// W5-4 (ADR-0038) — per-user DSR: export + delete + purge.
import { RealAccountService } from '../services/account.real'
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

  // W2-3 / EH-G — invoice & WO services need to share with change-order
  // via the apply-on-approve hooks. Construct concrete instances first
  // so the factory can pass closures around them.
  const invoice = new RealInvoiceService(tenantResolver)
  const workOrder = new RealWorkOrderService(tenantResolver)
  const invoicePayment = new RealInvoicePaymentService(tenantResolver)
  const changeOrder = new RealChangeOrderService(tenantResolver, {
    appendInvoiceLine: (invId, orgId, line) => invoice.appendLineItem(invId, orgId, line),
    appendWorkOrderNote: (woId, orgId, note) => workOrder.appendNote(woId, orgId, note),
  })

  return {
    auth,
    property: new RealPropertyService(tenantResolver),
    client: new RealClientService(tenantResolver),
    assessment: new RealAssessmentService(tenantResolver),
    quote: new RealQuoteService(tenantResolver),
    subcontractor: new RealSubcontractorService(tenantResolver),
    workOrder,
    job: new RealJobService(tenantResolver),
    complianceDoc: new RealComplianceDocService(tenantResolver),
    invoice,
    standards: new RealStandardsService(tenantResolver),
    apiKey: new RealApiKeyService(tenantResolver),
    // Wave 1A (EH-A / ADR-0013): GC program registry.
    program: new RealProgramService(tenantResolver),
    // Wave 1A (EH-B / ADR-0014): CMS label registry + branding.
    label: new RealLabelService(tenantResolver),
    // Wave 1B (EH-D / ADR-0017): append-only audit + property timeline.
    audit: new RealAuditService(undefined, tenantResolver),
    // Wave 1B (EH-H / ADR-0023): admin config — pipelines, trades, settings.
    statusPipeline: new RealStatusPipelineService(tenantResolver),
    trade: new RealTradeService(tenantResolver),
    orgSettings: new RealOrgSettingsService(tenantResolver),
    // Wave 2 (EH-F / ADR-0019): inspection template engine.
    inspectionTemplate: new RealInspectionTemplateService(tenantResolver),
    inspection: new RealInspectionService(tenantResolver),
    // W2-3 / EH-G (ADR-0020): change orders + invoice payment ledger.
    changeOrder,
    invoicePayment,
    // W2-4 / EH-H Part B (ADR-0021/0022): admin hub buildout.
    user: new RealUserService(tenantResolver),
    featureFlag: new RealFeatureFlagService(tenantResolver),
    providerConfig: new RealProviderConfigService(tenantResolver),
    webhook: new RealWebhookService(tenantResolver),
    notificationSubscription: new RealNotificationSubscriptionService(tenantResolver),
    // W2-5 / EH-I (ADR-0024/25): MFA + permission overrides.
    mfa: new RealMfaService(),
    permission: new RealPermissionService(tenantResolver),
    // W2-1 / EH-E (ADR-0018): property depth.
    building: new RealBuildingService(tenantResolver),
    contact: new RealContactService(tenantResolver),
    propertyPhoto: new RealPropertyPhotoService(tenantResolver),
    propertyAttachment: new RealPropertyAttachmentService(tenantResolver),
    // W3-1 / EH-J (ADR-0027): in-app notification feed.
    notification: new RealNotificationService(tenantResolver),
    // W3-2 / EH-K (ADR-0030): read-only reporting + dashboards.
    reporting: new RealReportingService(tenantResolver),
    // W3-5 / EH-P (ADR-0033): global search + saved list views.
    search: new RealSearchService(tenantResolver),
    savedView: new RealSavedViewService(tenantResolver),
    // W3-4 / EH-O (ADR-0032): homeowner portal.
    homeowner: new RealHomeownerService(tenantResolver),
    // W5-4 (ADR-0038): per-user DSR — export + delete + purge.
    account: new RealAccountService(tenantResolver),
  } as BulwarkServices
}

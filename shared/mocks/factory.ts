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
import { MockStandardsService } from './standards.mock'
import { MockApiKeyService } from './api-key.mock'
import { MockProgramService } from './program.mock'
import { MockLabelService } from './label.mock'
import { MockAuditService } from './audit.mock'
import { MockStatusPipelineService } from './status-pipeline.mock'
import { MockTradeService } from './trade.mock'
import { MockOrgSettingsService } from './org-settings.mock'
import { MockInspectionTemplateService } from './inspection-template.mock'
import { MockInspectionService } from './inspection.mock'
// W2-4 / EH-H Part B — admin hub: users, flags, providers, webhooks, notifs.
import { MockUserService } from './user.mock'
import { MockFeatureFlagService } from './feature-flag.mock'
import { MockProviderConfigService } from './provider-config.mock'
import { MockWebhookService } from './webhook.mock'
import { MockNotificationSubscriptionService } from './notification-subscription.mock'
import { MockChangeOrderService } from './change-order.mock'
import { MockInvoicePaymentService } from './invoice-payment.mock'
// W2-5 / EH-I — auth hardening: MFA + permission overrides (ADR-0024/25).
import { MockMfaService } from './mfa.mock'
import { MockPermissionService } from './permission.mock'
// W2-1 / EH-E — property depth (ADR-0018).
import { MockBuildingService } from './building.mock'
import { MockContactService } from './contact.mock'
import { MockPropertyPhotoService } from './property-photo.mock'
import { MockPropertyAttachmentService } from './property-attachment.mock'
// W3-1 / EH-J — in-app notification feed (ADR-0027).
import { MockNotificationService } from './notification.mock'
// W3-4 / EH-O — homeowner portal (ADR-0032).
import { MockHomeownerService } from './homeowner.mock'
// W3-2 / EH-K — reporting + dashboards (ADR-0030).
import { MockReportingService } from './reporting.mock'
// W3-5 / EH-P — global search + saved views (ADR-0033).
import { MockSearchService, type SearchAdapter } from './search.mock'
import { MockSavedViewService } from './saved-view.mock'
// W5-4 — Data Subject Rights export/delete (ADR-0038).
import { MockAccountService } from './account.mock'
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
    // W2-2 / EH-F — wire inspection template + inspection mocks. The
    // inspection mock depends on the template mock to load
    // section/field trees during evaluate(); we pass a closure that
    // forwards to the template mock so the factory remains the only
    // place that knows about the cross-service dependency.
    const inspectionTemplate = new MockInspectionTemplateService(resolver)
    const inspection = new MockInspectionService(resolver, (id, orgId) =>
      inspectionTemplate.getWithSections(id, orgId),
    )
    // W2-3 / EH-G — payment ledger + change orders. The invoice mock
    // takes a reference to the payment-ledger singleton so the
    // `recordPayment` envelope wrapper writes through the same store
    // the AR aging view reads.
    const invoicePayment = new MockInvoicePaymentService(resolver)
    const invoice = new MockInvoiceService(resolver, invoicePayment)
    const workOrder = new MockWorkOrderService(resolver)
    const changeOrder = new MockChangeOrderService(resolver, {
      appendInvoiceLine: async (invId, orgId, line) => {
        // Cheaply mutate the invoice envelope: re-read, push the line,
        // recompute totals via the existing helper, write back through
        // markSent path? No — the mock store is a module-level array;
        // we mutate in place since we own the singleton.
        const target = await invoice.get(invId, orgId)
        if (!target) throw new Error(`Invoice ${invId} not found`)
        target.lineItems.push(line)
        // Naive totals rebump so the UI sees the new amount.
        const newTotal =
          target.totals.totalCents + Math.round(line.quantity * line.unitCostCents)
        target.totals = { ...target.totals, totalCents: newTotal, subtotalCents: target.totals.subtotalCents + Math.round(line.quantity * line.unitCostCents) }
        return target
      },
      appendWorkOrderNote: async (woId, orgId, note) => {
        const target = await workOrder.get(woId, orgId)
        if (!target) throw new Error(`Work order ${woId} not found`)
        target.notes = target.notes ? `${target.notes}\n${note}` : note
        return target
      },
    })
    // W2-1 / EH-E (ADR-0018) — construct sibling services first so the
    // property mock can read from them in `getWithDepth`.
    const propertyMock = new MockPropertyService(resolver)
    const buildingMock = new MockBuildingService(resolver)
    const contactMock = new MockContactService(resolver)
    const propertyPhotoMock = new MockPropertyPhotoService(resolver)
    const propertyAttachmentMock = new MockPropertyAttachmentService(resolver)
    propertyMock.attachDepthSources({
      building: buildingMock,
      contact: contactMock,
      photo: propertyPhotoMock,
    })
    // W3-2 / EH-K (ADR-0030): pre-construct services the reporting
    // mock needs to read so reporting can be wired into the literal
    // bag below without a two-pass null cast.
    const quoteMock = new MockQuoteService(resolver)
    const subcontractorMock = new MockSubcontractorService(resolver)
    const complianceDocMock = new MockComplianceDocService(resolver, () => job)
    const programMock = new MockProgramService(resolver)
    const reportingMock = new MockReportingService(
      {
        quote: quoteMock,
        invoice,
        invoicePayment,
        workOrder,
        property: propertyMock,
        subcontractor: subcontractorMock,
        inspection,
        complianceDoc: complianceDocMock,
        program: programMock,
      },
      resolver,
    )
    cachedServices = {
      auth,
      property: propertyMock,
      client: new MockClientService(resolver),
      assessment: new MockAssessmentService(resolver),
      quote: quoteMock,
      subcontractor: subcontractorMock,
      workOrder,
      job,
      complianceDoc: complianceDocMock,
      invoice,
      standards: new MockStandardsService(resolver),
      apiKey: new MockApiKeyService(resolver),
      // Wave 1A (EH-A / ADR-0013): GC program registry.
      program: programMock,
      // Wave 1A (EH-B / ADR-0014): CMS label registry + branding.
      label: new MockLabelService(resolver),
      // Wave 1B (EH-D / ADR-0017): append-only audit + property timeline.
      audit: new MockAuditService(resolver),
      // Wave 1B (EH-H / ADR-0023): admin config — pipelines, trades, settings.
      statusPipeline: new MockStatusPipelineService(resolver),
      trade: new MockTradeService(resolver),
      orgSettings: new MockOrgSettingsService(resolver),
      // Wave 2 (EH-F / ADR-0019): inspection template engine.
      inspectionTemplate,
      inspection,
      // W2-3 / EH-G (ADR-0020): change orders + invoice payment ledger.
      changeOrder,
      invoicePayment,
      // W2-4 / EH-H Part B (ADR-0021/0022): admin hub buildout.
      user: new MockUserService(resolver),
      featureFlag: new MockFeatureFlagService(resolver),
      providerConfig: new MockProviderConfigService(resolver),
      webhook: new MockWebhookService(resolver),
      notificationSubscription: new MockNotificationSubscriptionService(resolver),
      // W2-1 / EH-E (ADR-0018): property depth.
      building: buildingMock,
      contact: contactMock,
      propertyPhoto: propertyPhotoMock,
      propertyAttachment: propertyAttachmentMock,
      // W2-5 / EH-I (ADR-0024/25): MFA + permission overrides.
      mfa: new MockMfaService(),
      permission: new MockPermissionService(resolver),
      // W3-1 / EH-J (ADR-0027): in-app notification feed.
      notification: new MockNotificationService(resolver),
      // W3-5 / EH-P (ADR-0033): global search + saved list views.
      search: new MockSearchService(resolver),
      savedView: new MockSavedViewService(resolver),
      reporting: reportingMock,
      // W3-4 / EH-O (ADR-0032): homeowner portal.
      homeowner: new MockHomeownerService(resolver),
      // W5-4 (ADR-0038): per-user DSR — export + delete + purge.
      account: new MockAccountService(),
    }
    // W3-5 / EH-P (ADR-0033): wire search adapters now that all
    // mocks exist. Each adapter calls the corresponding mock's
    // `list` and maps rows into the search-result shape.
    const search = cachedServices!.search as MockSearchService
    const adapters: SearchAdapter[] = [
      {
        entityType: 'property',
        listForOrg: async (orgId) => {
          const r = await cachedServices!.property.list({ organizationId: orgId, page: 1, pageSize: 100 })
          return r.rows.map((p) => ({
            id: p.id,
            organizationId: p.organizationId,
            title: p.addressLine1,
            subtitle: `${p.city}, ${p.state} · ${p.status}`,
            url: `/admin/properties/${p.id}`,
          }))
        },
      },
      {
        entityType: 'client',
        listForOrg: async (orgId) => {
          const r = await cachedServices!.client.list({ organizationId: orgId, page: 1, pageSize: 100 })
          return r.rows.map((c) => ({
            id: c.id,
            organizationId: c.organizationId,
            title: c.fullName,
            subtitle: c.email ?? c.phone ?? '',
            url: `/admin/clients/${c.id}`,
          }))
        },
      },
      {
        entityType: 'quote',
        listForOrg: async (orgId) => {
          const r = await cachedServices!.quote.list({ organizationId: orgId, page: 1, pageSize: 100 })
          return r.rows.map((q) => ({
            id: q.id,
            organizationId: q.organizationId,
            title: q.quoteNumber,
            subtitle: `Quote · ${q.status}`,
            url: `/admin/properties/${q.propertyId}/quotes/${q.id}`,
          }))
        },
      },
      {
        entityType: 'work-order',
        listForOrg: async (orgId) => {
          const r = await cachedServices!.workOrder.list({ organizationId: orgId, page: 1, pageSize: 100 })
          return r.rows.map((w) => ({
            id: w.id,
            organizationId: w.organizationId,
            title: w.workOrderNumber,
            subtitle: `Work order · ${w.status}`,
            url: `/admin/work-orders/${w.id}`,
          }))
        },
      },
      {
        entityType: 'invoice',
        listForOrg: async (orgId) => {
          const r = await cachedServices!.invoice.list({ organizationId: orgId, page: 1, pageSize: 100 })
          return r.rows.map((i) => ({
            id: i.id,
            organizationId: i.organizationId,
            title: i.invoiceNumber,
            subtitle: `Invoice · ${i.status}`,
            url: `/admin/invoices/${i.id}`,
          }))
        },
      },
      {
        entityType: 'subcontractor',
        listForOrg: async (orgId) => {
          const r = await cachedServices!.subcontractor.list({ organizationId: orgId, page: 1, pageSize: 100 })
          return r.rows.map((s) => ({
            id: s.id,
            organizationId: s.organizationId,
            title: s.companyName,
            subtitle: s.contactName,
            url: `/admin/subcontractors/${s.id}`,
          }))
        },
      },
    ]
    search.registerAdapters(adapters)
  }
  return cachedServices!
}

/**
 * Test-only escape hatch: clears the cached singleton so each test gets a
 * fresh factory with its own resolver. Production code never calls this.
 */
export function __resetMockServicesForTests(): void {
  cachedServices = null
}


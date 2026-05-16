/**
 * shared/contracts/services.ts — service contract barrel + factory shape.
 *
 * UI never imports a service class directly; it calls `useService('property')`
 * which is a Nuxt plugin (added in E0-S6) that returns the impl matching
 * the BULWARK_BACKEND env var. ADR-0004.
 */
import type { IAuthService } from './auth'
import type { IPropertyService } from './property'
import type { IClientService } from './client'
import type { IAssessmentService } from './assessment'
import type { IQuoteService } from './quote'
import type { ISubcontractorService } from './subcontractor'
import type { IWorkOrderService } from './work-order'
import type { IJobService } from './job'
import type { IComplianceDocService } from './compliance'
import type { IInvoiceService } from './invoice'
import type { IStandardsService } from './standards'
import type { IApiKeyService } from './api-key'
import type { ILabelService } from './label'
import type { IProgramService } from './program'
import type { IAuditService } from './audit'
import type { IStatusPipelineService } from './status-pipeline'
import type { ITradeService } from './trade'
import type { IOrgSettingsService } from './org-settings'
import type { IChangeOrderService } from './change-order'
import type { IInvoicePaymentService } from './invoice-payment'
import type { IInspectionTemplateService } from './inspection-template'
import type { IInspectionService } from './inspection'
import type { IUserService } from './user'
import type { IFeatureFlagService } from './feature-flag'
import type { IProviderConfigService } from './provider-config'
import type { IWebhookService } from './webhook'
import type { INotificationSubscriptionService } from './notification-subscription'
import type { IMfaService } from './mfa'
import type { IPermissionService } from './permission'
// W2-1 / EH-E — property depth (buildings, sections, contacts, photos, attachments).
import type { IBuildingService } from './building'
import type { IContactService } from './contact'
import type { IPropertyPhotoService } from './property-photo'
import type { IPropertyAttachmentService } from './property-attachment'
// W3-1 / EH-J — in-app notification feed (ADR-0027).
import type { INotificationService } from './notification'
// W3-4 / EH-O — homeowner portal (ADR-0032).
import type { IHomeownerService } from './homeowner'
// W3-5 / EH-P — global search + saved list views (ADR-0033).
import type { ISearchService } from './search'
import type { ISavedViewService } from './saved-view'
// W3-2 / EH-K — reporting + dashboards (ADR-0030).
import type { IReportingService } from './reporting'
// W5-4 — Data Subject Rights: export + delete (ADR-0038).
import type { IAccountService } from './account'

export interface BulwarkServices {
  auth: IAuthService
  property: IPropertyService
  client: IClientService
  assessment: IAssessmentService
  quote: IQuoteService
  subcontractor: ISubcontractorService
  workOrder: IWorkOrderService
  job: IJobService
  complianceDoc: IComplianceDocService
  invoice: IInvoiceService
  standards: IStandardsService
  apiKey: IApiKeyService
  // E0-S6 stubs the rest as we add them: auditLog, settings.*
  // EH-B / W1-2 — CMS label registry + per-tenant branding (ADR-0014).
  label: ILabelService
  // EH-A / W1-1 — GC program registry (ADR-0013).
  program: IProgramService
  // EH-D / W1-4 — append-only audit + property timeline (ADR-0017).
  audit: IAuditService
  // EH-H / W1-3 — admin config: status pipelines, trades, org settings (ADR-0023).
  statusPipeline: IStatusPipelineService
  trade: ITradeService
  orgSettings: IOrgSettingsService
  // EH-F / W2-2 — inspection template engine (ADR-0019).
  inspectionTemplate: IInspectionTemplateService
  inspection: IInspectionService
  // W2-3 / EH-G — change orders + invoice payment ledger (ADR-0020).
  changeOrder: IChangeOrderService
  invoicePayment: IInvoicePaymentService
  // EH-H / W2-4 — admin hub Part B (users, flags, providers, webhooks, notifs).
  user: IUserService
  featureFlag: IFeatureFlagService
  providerConfig: IProviderConfigService
  webhook: IWebhookService
  notificationSubscription: INotificationSubscriptionService
  // W2-1 / EH-E — property depth (ADR-0018).
  building: IBuildingService
  contact: IContactService
  propertyPhoto: IPropertyPhotoService
  propertyAttachment: IPropertyAttachmentService
  // W2-5 / EH-I (ADR-0023/24/25): auth hardening — MFA + permission overrides.
  mfa: IMfaService
  permission: IPermissionService
  // W3-1 / EH-J (ADR-0027): in-app notification feed.
  notification: INotificationService
  // W3-2 / EH-K (ADR-0030): read-only reporting + dashboards.
  reporting: IReportingService
  // W3-5 / EH-P (ADR-0033): global cross-entity search + saved list views.
  search: ISearchService
  savedView: ISavedViewService
  // W3-4 / EH-O (ADR-0032): homeowner portal.
  homeowner: IHomeownerService
  // W5-4 (ADR-0038): per-user DSR — export + delete + purge.
  account: IAccountService
}

export type ServiceName = keyof BulwarkServices

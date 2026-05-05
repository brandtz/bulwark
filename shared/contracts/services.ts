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
}

export type ServiceName = keyof BulwarkServices

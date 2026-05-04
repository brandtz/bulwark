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

export interface BulwarkServices {
  auth: IAuthService
  property: IPropertyService
  client: IClientService
  assessment: IAssessmentService
  // E0-S6 stubs the rest as we add them: quote, workOrder, sub,
  // complianceDoc, invoice, job, auditLog, apiKey, settings.*
}

export type ServiceName = keyof BulwarkServices

/**
 * shared/contracts/permit.ts — permits + jurisdictions catalog (WP-X2, ED-039).
 *
 * # Decisions (ED-039)
 *   - Permits are property-scoped, with an optional many-to-many to work
 *     orders (a permit can cover several jobs; a job can need several permits).
 *   - Jurisdictions are a per-tenant catalog; a permit may instead carry a
 *     free-text `jurisdictionOther` ("Other"). Exactly one of the two may be set.
 *   - Status moves draft → applied → issued → (expired | closed); `issued`
 *     requires an issue date. Expiry is surfaced for reminders (L05 job).
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const PermitStatusSchema = z.enum(['draft', 'applied', 'issued', 'expired', 'closed'])
export type PermitStatus = z.infer<typeof PermitStatusSchema>

export const JurisdictionSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    name: z.string().min(1).max(160),
    code: z.string().max(60).nullable(),
  })
  .merge(AuditFieldsSchema)
export type Jurisdiction = z.infer<typeof JurisdictionSchema>

export const PermitSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    propertyId: UuidSchema,
    jurisdictionId: UuidSchema.nullable(),
    jurisdictionOther: z.string().max(160).nullable(),
    permitNumber: z.string().max(80).nullable(),
    kind: z.string().min(1).max(60),
    status: PermitStatusSchema,
    appliedAt: z.string().datetime().nullable(),
    issuedAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
    notes: z.string().max(4000).nullable(),
    workOrderIds: z.array(UuidSchema),
  })
  .merge(AuditFieldsSchema)
export type Permit = z.infer<typeof PermitSchema>

const permitFields = {
  jurisdictionId: UuidSchema.nullable().optional(),
  jurisdictionOther: z.string().trim().max(160).nullable().optional(),
  permitNumber: z.string().trim().max(80).nullable().optional(),
  kind: z.string().trim().min(1).max(60).optional(),
  status: PermitStatusSchema.optional(),
  appliedAt: z.string().datetime().nullable().optional(),
  issuedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
}

export const PermitCreateInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  workOrderIds: z.array(UuidSchema).max(50).default([]),
  ...permitFields,
})
export type PermitCreateInput = z.input<typeof PermitCreateInputSchema>

export const PermitUpdateInputSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  ...permitFields,
})
export type PermitUpdateInput = z.input<typeof PermitUpdateInputSchema>

export const PermitListInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema.optional(),
  workOrderId: UuidSchema.optional(),
  status: PermitStatusSchema.optional(),
  /** Only permits expiring on or before this instant (reminders / dashboards). */
  expiringBefore: z.string().datetime().optional(),
})
export type PermitListInput = z.input<typeof PermitListInputSchema>

export interface IPermitService {
  list(input: PermitListInput): Promise<Permit[]>
  get(id: string, organizationId: string): Promise<Permit | null>
  create(input: PermitCreateInput): Promise<Permit>
  update(input: PermitUpdateInput): Promise<Permit>
  softDelete(id: string, organizationId: string): Promise<void>
  linkWorkOrder(input: { organizationId: string, permitId: string, workOrderId: string }): Promise<Permit>
  unlinkWorkOrder(input: { organizationId: string, permitId: string, workOrderId: string }): Promise<Permit>
  listJurisdictions(organizationId: string): Promise<Jurisdiction[]>
  upsertJurisdiction(input: { organizationId: string, id?: string, name: string, code?: string | null }): Promise<Jurisdiction>
  deleteJurisdiction(id: string, organizationId: string): Promise<void>
}

/** Shared status/field rules (real + mock). Returns an error message or null. */
export function validatePermitState(p: {
  status: PermitStatus
  issuedAt: string | null
  jurisdictionId: string | null
  jurisdictionOther: string | null
}): string | null {
  if (p.jurisdictionId && p.jurisdictionOther) return 'Invalid permit: pick a jurisdiction from the catalog or enter "Other", not both'
  if (p.status === 'issued' && !p.issuedAt) return 'Invalid permit: an issued permit needs its issue date'
  return null
}

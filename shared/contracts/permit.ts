/**
 * shared/contracts/permit.ts — permits, jurisdiction inspections and the
 * jurisdictions catalog (WP-X2, ED-039, ED-061; design AD-19).
 *
 * # Decisions
 *   - Permits are property-scoped, with an optional many-to-many to work
 *     orders (a permit can cover several jobs; a job can need several permits).
 *   - Jurisdictions are a per-tenant catalog; a permit may instead carry a
 *     free-text `jurisdictionOther` ("Other"). Exactly one of the two is set.
 *   - ED-061 (AD-19): statuses are applied → issued → inspections_in_progress →
 *     final_approved, with expired and withdrawn branches; expired may be
 *     renewed (→ issued). `PERMIT_TRANSITIONS` is the whole table; anything
 *     else is refused. Permit number, jurisdiction, scope and status are
 *     required; an issue date is required from `issued` on; expiry must be
 *     after issue.
 *   - Jurisdiction inspections (`PermitInspection`) are the authority's
 *     inspections, distinct from our own (AD-21). A non-pass result needs a
 *     note. Scheduling one on an `issued` permit moves it to
 *     `inspections_in_progress`.
 *   - Writes are manager+ (AD-19); field staff read.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const PermitStatusSchema = z.enum(['applied', 'issued', 'inspections_in_progress', 'final_approved', 'expired', 'withdrawn'])
export type PermitStatus = z.infer<typeof PermitStatusSchema>

/** Legal status changes (ED-061). Staying in the same status is always allowed. */
export const PERMIT_TRANSITIONS: Readonly<Record<PermitStatus, readonly PermitStatus[]>> = {
  applied: ['issued', 'expired', 'withdrawn'],
  issued: ['inspections_in_progress', 'final_approved', 'expired', 'withdrawn'],
  inspections_in_progress: ['final_approved', 'expired', 'withdrawn'],
  expired: ['issued'],
  final_approved: [],
  withdrawn: [],
}

/** Statuses at or after issue: an issue date is required. */
const ISSUED_OR_LATER: ReadonlySet<PermitStatus> = new Set(['issued', 'inspections_in_progress', 'final_approved'])

export const PermitInspectionResultSchema = z.enum(['passed', 'corrections_required', 'failed'])
export type PermitInspectionResult = z.infer<typeof PermitInspectionResultSchema>

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
    scope: z.string().max(500).nullable(),
    status: PermitStatusSchema,
    appliedAt: z.string().datetime().nullable(),
    issuedAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
    notes: z.string().max(4000).nullable(),
    pdfAttachmentId: UuidSchema.nullable(),
    workOrderIds: z.array(UuidSchema),
  })
  .merge(AuditFieldsSchema)
export type Permit = z.infer<typeof PermitSchema>

export const PermitInspectionSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    permitId: UuidSchema,
    inspectionType: z.string().min(1).max(120),
    scheduledAt: z.string().datetime(),
    inspector: z.string().max(160).nullable(),
    result: PermitInspectionResultSchema.nullable(),
    resultNote: z.string().max(2000).nullable(),
    recordedAt: z.string().datetime().nullable(),
    recordedByUserId: UuidSchema.nullable(),
  })
  .merge(AuditFieldsSchema)
export type PermitInspection = z.infer<typeof PermitInspectionSchema>

const permitFields = {
  jurisdictionId: UuidSchema.nullable().optional(),
  jurisdictionOther: z.string().trim().max(160).nullable().optional(),
  permitNumber: z.string().trim().max(80).nullable().optional(),
  kind: z.string().trim().min(1).max(60).optional(),
  scope: z.string().trim().max(500).nullable().optional(),
  status: PermitStatusSchema.optional(),
  appliedAt: z.string().datetime().nullable().optional(),
  issuedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  pdfAttachmentId: UuidSchema.nullable().optional(),
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

export const PermitInspectionListInputSchema = z.object({
  organizationId: UuidSchema,
  permitId: UuidSchema.optional(),
  propertyId: UuidSchema.optional(),
})
export type PermitInspectionListInput = z.input<typeof PermitInspectionListInputSchema>

export const PermitInspectionScheduleInputSchema = z.object({
  organizationId: UuidSchema,
  permitId: UuidSchema,
  inspectionType: z.string().trim().min(1).max(120),
  scheduledAt: z.string().datetime(),
  inspector: z.string().trim().max(160).nullable().optional(),
})
export type PermitInspectionScheduleInput = z.input<typeof PermitInspectionScheduleInputSchema>

export const PermitInspectionResultInputSchema = z.object({
  organizationId: UuidSchema,
  id: UuidSchema,
  result: PermitInspectionResultSchema,
  note: z.string().trim().max(2000).nullable().optional(),
}).refine((v) => v.result === 'passed' || !!v.note, { message: 'A note is required when corrections are required or the inspection failed', path: ['note'] })
export type PermitInspectionResultInput = z.input<typeof PermitInspectionResultInputSchema>

export interface IPermitService {
  list(input: PermitListInput): Promise<Permit[]>
  get(id: string, organizationId: string): Promise<Permit | null>
  create(input: PermitCreateInput): Promise<Permit>
  update(input: PermitUpdateInput): Promise<Permit>
  softDelete(id: string, organizationId: string): Promise<void>
  linkWorkOrder(input: { organizationId: string, permitId: string, workOrderId: string }): Promise<Permit>
  unlinkWorkOrder(input: { organizationId: string, permitId: string, workOrderId: string }): Promise<Permit>
  listInspections(input: PermitInspectionListInput): Promise<PermitInspection[]>
  scheduleInspection(input: PermitInspectionScheduleInput): Promise<PermitInspection>
  recordInspectionResult(input: PermitInspectionResultInput): Promise<PermitInspection>
  listJurisdictions(organizationId: string): Promise<Jurisdiction[]>
  upsertJurisdiction(input: { organizationId: string, id?: string, name: string, code?: string | null }): Promise<Jurisdiction>
  deleteJurisdiction(id: string, organizationId: string): Promise<void>
}

/**
 * Shared field rules (real + mock) for the permit as it will be after a write.
 * Returns an error message or null.
 */
export function validatePermitState(p: {
  status: PermitStatus
  permitNumber: string | null
  scope: string | null
  issuedAt: string | null
  expiresAt: string | null
  jurisdictionId: string | null
  jurisdictionOther: string | null
}): string | null {
  if (p.jurisdictionId && p.jurisdictionOther) return 'Invalid permit: pick a jurisdiction from the catalog or enter "Other", not both'
  if (!p.jurisdictionId && !p.jurisdictionOther) return 'Invalid permit: a jurisdiction is required'
  if (!p.permitNumber) return 'Invalid permit: a permit number is required'
  if (!p.scope) return 'Invalid permit: a scope is required'
  if (ISSUED_OR_LATER.has(p.status) && !p.issuedAt) return 'Invalid permit: an issued permit needs its issue date'
  if (p.issuedAt && p.expiresAt && new Date(p.expiresAt) <= new Date(p.issuedAt)) return 'Invalid permit: expiry must be after the issue date'
  return null
}

/** Error message for an illegal status change, or null (ED-061). */
export function permitTransitionError(from: PermitStatus, to: PermitStatus): string | null {
  if (from === to || PERMIT_TRANSITIONS[from].includes(to)) return null
  return `Invalid permit status change: ${from} → ${to}`
}

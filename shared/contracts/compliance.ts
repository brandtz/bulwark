/**
 * shared/contracts/compliance.ts — Compliance document domain (E7).
 *
 * # Decisions (ADR-0008)
 *   - A `ComplianceDoc` is the artifact a GC hands to the homeowner +
 *     insurer. It snapshots which work-order trade slots were completed
 *     under what compliance scope and carries a captured signature
 *     plus the (eventual) signed PDF URL. The PDF itself is generated
 *     async via the E7-S1 job pipeline.
 *   - `status` mirrors the underlying job, with one extra terminal of
 *     `cancelled` reserved for future "throw away a draft" UX.
 *   - We store the signature inline (data URL + signer name + signed
 *     timestamp). Rationale: the signature ceremony is the human input
 *     that kicks off generation; persisting it separately would
 *     complicate the read path with no gain. Real backend will offload
 *     the data URL to R2 alongside the PDF in E11.
 *
 * # Decision cast down
 *   - Rejected: per-line-item scoping inside `includedSlotIds`. v1
 *     scope = "the trade slots that are completed and selected". The
 *     ORS/OAR references on the rendered doc come from the linked
 *     assessment, not from a manual catalog pick.
 *   - Rejected: storing the rendered HTML body in the row. The mock
 *     can fabricate a URL; the real worker writes the PDF and returns
 *     a signed URL. Either way the doc row only owns inputs + result
 *     pointer.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Status — mirrors the job pipeline. `draft` is reserved for a future
// "save and finish later" flow; today every doc starts at `generating`.
// ----------------------------------------------------------------------------
export const ComplianceDocStatusSchema = z.enum([
  'draft',
  'generating',
  'ready',
  'failed',
  'cancelled',
])
export type ComplianceDocStatus = z.infer<typeof ComplianceDocStatusSchema>

export function isTerminalComplianceDocStatus(
  s: ComplianceDocStatus,
): boolean {
  return s === 'ready' || s === 'failed' || s === 'cancelled'
}

// ----------------------------------------------------------------------------
// Captured signature — name + canvas data URL + when it was signed.
// ----------------------------------------------------------------------------
export const ComplianceSignatureSchema = z.object({
  signedByName: z.string().min(1).max(120),
  /** PNG data URL captured from <canvas>. */
  dataUrl: z.string().min(20).startsWith('data:image/'),
  signedAt: z.string().datetime(),
})
export type ComplianceSignature = z.infer<typeof ComplianceSignatureSchema>

// ----------------------------------------------------------------------------
// ComplianceDoc record.
// ----------------------------------------------------------------------------
export const ComplianceDocSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    propertyId: UuidSchema,
    /** All WOs whose slots contributed scope to this doc. */
    workOrderIds: z.array(UuidSchema).min(1),
    /** Slot ids the GC chose to include. Subset of the WOs above. */
    includedSlotIds: z.array(UuidSchema).min(1),
    signature: ComplianceSignatureSchema,
    /** Job created in E7-S1 pipeline; null until the worker picks it up. */
    jobId: z.string().nullable(),
    status: ComplianceDocStatusSchema,
    /** Signed PDF URL once the worker writes it. */
    resultUrl: z.string().url().nullable(),
    error: z.string().nullable(),
  })
  .merge(AuditFieldsSchema)
export type ComplianceDoc = z.infer<typeof ComplianceDocSchema>

// ----------------------------------------------------------------------------
// Create input — caller specifies scope + signature; service stamps
// id, jobId, status, resultUrl, error, audit.
// ----------------------------------------------------------------------------
export const ComplianceDocCreateInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  workOrderIds: z.array(UuidSchema).min(1),
  includedSlotIds: z.array(UuidSchema).min(1),
  signature: ComplianceSignatureSchema.omit({ signedAt: true }),
})
export type ComplianceDocCreateInput = z.infer<
  typeof ComplianceDocCreateInputSchema
>

// ----------------------------------------------------------------------------
// List input.
// ----------------------------------------------------------------------------
export const ComplianceDocListInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema.optional(),
})
export type ComplianceDocListInput = z.infer<
  typeof ComplianceDocListInputSchema
>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IComplianceDocService {
  list(input: ComplianceDocListInput): Promise<ComplianceDoc[]>
  get(id: string, organizationId: string): Promise<ComplianceDoc | null>
  create(input: ComplianceDocCreateInput): Promise<ComplianceDoc>
  /**
   * Reconcile a doc with the current state of its async job. Idempotent.
   * Used by UI polling to mirror job status onto the doc row.
   */
  syncFromJob(id: string, organizationId: string): Promise<ComplianceDoc>
}

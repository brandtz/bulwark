/**
 * shared/contracts/change-order.ts — Change order domain (W2-3 / EH-G).
 *
 * # Why this exists (ADR-0020)
 *
 * Change orders are the contracted way for GCs to record post-quote scope
 * changes: a new line item (or credit) priced AFTER the original quote was
 * accepted. ServiceTitan, Jobber and Buildertrend all model these as a
 * first-class entity with a customer signature. We follow the same model:
 *
 *   - A change order can attach to either a work order (most common — the
 *     job is already in flight) or an invoice (rare — scope creep caught
 *     post-WO at billing). Both FKs are nullable but at-least-one is
 *     required (enforced at the service layer, NOT in the Zod schema, so
 *     the row can exist as `proposed` before attachment).
 *   - `amountCents` is signed (negative = credit). All money in integer
 *     cents per ADR-0008.
 *   - Status pipeline: `proposed → approved | rejected`. Approval records
 *     the approver name + (optional) signature URL and stamps `approvedAt`.
 *
 * # Decisions cast down (ADR-0008)
 *
 *   - Rejected: a separate `change_order_line_items` table. v1 stores a
 *     single delta amount per CO; multi-line COs are out of scope.
 *   - Rejected: persisting the signed PDF alongside the CO. Signature URL
 *     points at object storage; PDF generation can land in Wave 3.
 *   - Rejected: a transition from `approved` → `applied`. The service
 *     applies the CO to the WO/invoice synchronously when approved, so an
 *     extra status step would be redundant.
 */
import { z } from 'zod'
import {
  AuditFieldsSchema,
  ListOutputSchema,
  PaginationInputSchema,
  UuidSchema,
} from './_shared'

export const ChangeOrderStatusSchema = z.enum(['proposed', 'approved', 'rejected'])
export type ChangeOrderStatus = z.infer<typeof ChangeOrderStatusSchema>

export const ChangeOrderSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    workOrderId: UuidSchema.nullable(),
    invoiceId: UuidSchema.nullable(),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    /** Signed integer cents. Negative = credit. */
    amountCents: z.number().int(),
    status: ChangeOrderStatusSchema,
    proposedByUserId: UuidSchema.nullable(),
    approvedAt: z.string().datetime().nullable(),
    rejectedAt: z.string().datetime().nullable(),
    /** Customer-facing name on the signature line. */
    approvedByName: z.string().max(200).nullable(),
    /** Object-storage URL of the captured signature (optional). */
    signatureUrl: z.string().url().max(500).nullable(),
    rejectedReason: z.string().max(1000).nullable(),
  })
  .merge(AuditFieldsSchema)
export type ChangeOrder = z.infer<typeof ChangeOrderSchema>

export const ChangeOrderProposeInputSchema = z.object({
  organizationId: UuidSchema,
  workOrderId: UuidSchema.nullable(),
  invoiceId: UuidSchema.nullable(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  amountCents: z.number().int(),
  proposedByUserId: UuidSchema.nullable(),
})
export type ChangeOrderProposeInput = z.infer<typeof ChangeOrderProposeInputSchema>

export const ChangeOrderApproveInputSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  approvedByName: z.string().min(1).max(200),
  signatureUrl: z.string().url().max(500).optional().nullable(),
})
export type ChangeOrderApproveInput = z.infer<typeof ChangeOrderApproveInputSchema>

export const ChangeOrderRejectInputSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  reason: z.string().min(1).max(1000),
})
export type ChangeOrderRejectInput = z.infer<typeof ChangeOrderRejectInputSchema>

export const ChangeOrderListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  workOrderId: UuidSchema.optional(),
  invoiceId: UuidSchema.optional(),
  status: ChangeOrderStatusSchema.optional(),
})
export type ChangeOrderListInput = z.infer<typeof ChangeOrderListInputSchema>

export const ChangeOrderListOutputSchema = ListOutputSchema(ChangeOrderSchema)
export type ChangeOrderListOutput = z.infer<typeof ChangeOrderListOutputSchema>

export interface IChangeOrderService {
  list(input: ChangeOrderListInput): Promise<ChangeOrderListOutput>
  get(id: string, organizationId: string): Promise<ChangeOrder | null>
  propose(input: ChangeOrderProposeInput): Promise<ChangeOrder>
  approve(input: ChangeOrderApproveInput): Promise<ChangeOrder>
  reject(input: ChangeOrderRejectInput): Promise<ChangeOrder>
}

/**
 * shared/contracts/invoice-payment.ts — Partial-payment ledger entries
 * (W2-3 / EH-G).
 *
 * # Why this exists (ADR-0020)
 *
 * Until this slice an invoice stored a single `paidAt + paidAmountCents`
 * pair, so two cheques against one invoice flattened into one row and
 * the partial-pay path was effectively broken. The `invoice_payments`
 * table is the canonical ledger: one row per receipt. The invoice's
 * status is derived from the sum (paid IFF Σ(payments.amountCents) ≥
 * totals.totalCents, partial otherwise) and emitted via the
 * invoiceMarkedPaid / invoicePartialPaid events.
 *
 * # Decisions cast down (ADR-0008)
 *
 *   - Rejected: storing payments inline as a JSONB array on the invoice.
 *     Ledger entries benefit from indexed FK reads (AR aging report) and
 *     are queried separately from the invoice envelope in most views.
 *   - Rejected: refunds as a separate entity. v1 records a refund as a
 *     payment with negative `amountCents`. Cleaner reconciliation path.
 *   - Rejected: Stripe-style method tags as opaque strings. Enumerating
 *     the 6 methods Drew listed (check/ach/card/cash/wire/other) keeps
 *     reports deterministic.
 */
import { z } from 'zod'
import {
  AuditFieldsSchema,
  ListOutputSchema,
  MoneyCentsSchema,
  PaginationInputSchema,
  UuidSchema,
} from './_shared'

export const InvoicePaymentMethodSchema = z.enum([
  'check',
  'ach',
  'card',
  'cash',
  'wire',
  'other',
])
export type InvoicePaymentMethod = z.infer<typeof InvoicePaymentMethodSchema>

export const InvoicePaymentSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    invoiceId: UuidSchema,
    /** Signed cents — negative entries represent refunds. */
    amountCents: z.number().int(),
    receivedAt: z.string().datetime(),
    method: InvoicePaymentMethodSchema,
    /** Cheque number, ACH trace id, etc. */
    reference: z.string().max(200).nullable(),
    notes: z.string().max(1000).nullable(),
    recordedByUserId: UuidSchema.nullable(),
  })
  .merge(AuditFieldsSchema)
export type InvoicePayment = z.infer<typeof InvoicePaymentSchema>

export const InvoicePaymentRecordInputSchema = z.object({
  organizationId: UuidSchema,
  invoiceId: UuidSchema,
  amountCents: z.number().int(),
  receivedAt: z.string().datetime().optional(),
  method: InvoicePaymentMethodSchema,
  reference: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  recordedByUserId: UuidSchema.nullable().optional(),
})
export type InvoicePaymentRecordInput = z.infer<typeof InvoicePaymentRecordInputSchema>

export const InvoicePaymentListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  invoiceId: UuidSchema.optional(),
})
export type InvoicePaymentListInput = z.infer<typeof InvoicePaymentListInputSchema>

export const InvoicePaymentListOutputSchema = ListOutputSchema(InvoicePaymentSchema)
export type InvoicePaymentListOutput = z.infer<typeof InvoicePaymentListOutputSchema>

/** Re-export to keep this file self-contained for the linter. */
export const _PAYMENT_MONEY_GUARD = MoneyCentsSchema

// ----------------------------------------------------------------------------
// Service interface (W2-3 / EH-G).
// ----------------------------------------------------------------------------
//
// The invoice envelope (`IInvoiceService`) owns lifecycle transitions
// (sent → partial → paid → voided). The payment service owns the ledger:
// listing, recording, and voiding individual entries. Splitting them
// keeps each surface narrowly auditable and matches the data shape
// (one invoice ↔ many payments).
export interface IInvoicePaymentService {
  /** Org-wide list, paginated. Used by AR aging reports. */
  list(input: InvoicePaymentListInput): Promise<InvoicePaymentListOutput>
  /**
   * Convenience: every payment ever applied to a single invoice (no
   * pagination — invoices rarely accrue more than a handful of rows).
   */
  listForInvoice(invoiceId: string, organizationId: string): Promise<InvoicePayment[]>
  /**
   * Append a payment row. Pure ledger insert — does NOT mutate the
   * invoice envelope. The InvoiceService.recordPayment wrapper calls
   * this then transitions the parent.
   */
  recordPayment(input: InvoicePaymentRecordInput): Promise<InvoicePayment>
  /**
   * Soft-delete a payment row. The invoice envelope status is NOT
   * auto-corrected by this method; callers reconcile via
   * `IInvoiceService.recordPayment` (negative amount) instead.
   */
  voidPayment(id: string, organizationId: string): Promise<InvoicePayment>
}

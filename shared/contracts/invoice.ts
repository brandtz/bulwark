/**
 * shared/contracts/invoice.ts — Invoice domain (E8).
 *
 * # Decisions (ADR-0008)
 *   - All money is integer cents (CONVENTIONS \u00a7Money). Totals are
 *     re-derived by `shared/utils/money.ts#computeQuoteTotals` (the same
 *     helper the quote uses) and embedded on the row.
 *   - An invoice belongs to a `propertyId` and points back at the
 *     `workOrderId` it bills against (the canonical "work is done"
 *     trigger). `quoteId` is captured nullable so a GC can bill change
 *     orders that were never quoted.
 *   - Status enum: `draft \u2192 sent \u2192 paid` with `overdue` as a derived
 *     read of (sent && dueAt < now && !paidAt). We persist `sent` and
 *     `paid` as ground-truth statuses; UI surfaces `overdue` by reading
 *     dueAt vs now. Voided / write-off out of scope until Phase 2.
 *   - Line items are denormalised onto the invoice. We could share the
 *     `QuoteLineItemSchema` but invoices add `discountCents` per line
 *     for partial-pay / retainer flows the sponsor mentioned, so we
 *     keep a parallel schema and pay the small duplication cost.
 *
 * # Decision cast down
 *   - Rejected: a separate `payment` entity with a 1\u2192N relation to
 *     invoices. Stripe lands in Phase 2 and brings its own. Until then
 *     `paidAt` + `paidAmountCents` on the invoice cover manual marks.
 *   - Rejected: storing `overdue` as a persisted status. It would have
 *     to be cron-rewritten every midnight. Derive at read time instead.
 */
import { z } from 'zod'
import {
  AuditFieldsSchema,
  ListOutputSchema,
  MoneyCentsSchema,
  PaginationInputSchema,
  UuidSchema,
} from './_shared'

// ----------------------------------------------------------------------------
// Status enum.
// ----------------------------------------------------------------------------
// W2-3 / EH-G: `partial` (between sent + paid) + `voided` (terminal).
// Order is editorial — keeps the pipeline kanban left-to-right.
export const InvoiceStatusSchema = z.enum(['draft', 'sent', 'partial', 'paid', 'voided'])
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>

/** Computed views surfaced on top of the persisted status. */
export type InvoiceView = InvoiceStatus | 'overdue'

export function deriveInvoiceView(invoice: {
  status: InvoiceStatus
  dueAt: string | null
  paidAt: string | null
}, nowIso: string = new Date().toISOString()): InvoiceView {
  if (invoice.status === 'paid') return 'paid'
  if (invoice.status === 'sent' && !invoice.paidAt && invoice.dueAt && invoice.dueAt < nowIso) {
    return 'overdue'
  }
  return invoice.status
}

// ----------------------------------------------------------------------------
// Line item.
// ----------------------------------------------------------------------------
export const InvoiceLineItemKindSchema = z.enum(['labor', 'material', 'other'])
export type InvoiceLineItemKind = z.infer<typeof InvoiceLineItemKindSchema>

export const InvoiceLineItemSchema = z.object({
  id: UuidSchema,
  kind: InvoiceLineItemKindSchema,
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitCostCents: MoneyCentsSchema,
})
export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>

// ----------------------------------------------------------------------------
// Totals.
// ----------------------------------------------------------------------------
export const InvoiceTotalsSchema = z.object({
  subtotalCents: MoneyCentsSchema,
  markupCents: MoneyCentsSchema,
  taxCents: MoneyCentsSchema,
  totalCents: MoneyCentsSchema,
})
export type InvoiceTotals = z.infer<typeof InvoiceTotalsSchema>

// ----------------------------------------------------------------------------
// Payment terms enum (W2-3 / EH-G).
// ----------------------------------------------------------------------------
export const InvoiceTermsSchema = z.enum([
  'due_on_receipt',
  'net_15',
  'net_30',
  'net_60',
  'custom',
])
export type InvoiceTerms = z.infer<typeof InvoiceTermsSchema>

/** Days-from-issue corresponding to each enumerated `terms` value. */
export const INVOICE_TERMS_DAYS: Record<Exclude<InvoiceTerms, 'custom'>, number> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_60: 60,
}

// ----------------------------------------------------------------------------
// Invoice record.
// ----------------------------------------------------------------------------
export const InvoiceSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    propertyId: UuidSchema,
    workOrderId: UuidSchema.nullable(),
    quoteId: UuidSchema.nullable(),
    invoiceNumber: z.string().min(1).max(40),
    status: InvoiceStatusSchema,
    issuedAt: z.string().datetime().nullable(),
    sentAt: z.string().datetime().nullable(),
    dueAt: z.string().datetime().nullable(),
    paidAt: z.string().datetime().nullable(),
    paidAmountCents: MoneyCentsSchema,
    lineItems: z.array(InvoiceLineItemSchema),
    markupPercent: z.number().min(0).max(200),
    taxPercent: z.number().min(0).max(50),
    notes: z.string().nullable(),
    totals: InvoiceTotalsSchema,
    // W2-3 / EH-G additions. Optional for fixture compatibility.
    /** Deposit required up-front (informational; not auto-applied to paid). */
    depositRequiredCents: MoneyCentsSchema.optional(),
    /** Deposit received so far. Counted toward balance. */
    depositReceivedCents: MoneyCentsSchema.optional(),
    /** Retainage withheld in basis points (e.g. 1000 = 10%). 0 = no retainage. */
    retainageBps: z.number().int().min(0).max(10_000).optional(),
    /** Retainage already released to the contractor. */
    retainageReleasedCents: MoneyCentsSchema.optional(),
    /** Payment terms — drives `dueDate` defaulting on issue. */
    terms: InvoiceTermsSchema.optional(),
    /** Hard due date (date-only ISO). Distinct from legacy `dueAt`. */
    dueDate: z.string().datetime().nullable().optional(),
    /** Timestamp the invoice was voided. */
    voidedAt: z.string().datetime().nullable().optional(),
    /** Free-text reason captured at void time. */
    voidedReason: z.string().max(1000).nullable().optional(),
  })
  .merge(AuditFieldsSchema)
export type Invoice = z.infer<typeof InvoiceSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const InvoiceCreateInputSchema = InvoiceSchema.omit({
  id: true,
  invoiceNumber: true,
  status: true,
  issuedAt: true,
  sentAt: true,
  paidAt: true,
  paidAmountCents: true,
  totals: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
})
export type InvoiceCreateInput = z.infer<typeof InvoiceCreateInputSchema>

export const InvoiceListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  propertyId: UuidSchema.optional(),
  /** Persisted status filter. `overdue` is a derived view; UI filters client-side. */
  status: InvoiceStatusSchema.optional(),
})
export type InvoiceListInput = z.infer<typeof InvoiceListInputSchema>

export const InvoiceListOutputSchema = ListOutputSchema(InvoiceSchema)
export type InvoiceListOutput = z.infer<typeof InvoiceListOutputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IInvoiceService {
  list(input: InvoiceListInput): Promise<InvoiceListOutput>
  get(id: string, organizationId: string): Promise<Invoice | null>
  create(input: InvoiceCreateInput): Promise<Invoice>
  /** Stamps `sentAt`, transitions draft \u2192 sent. Idempotent on sent rows. */
  markSent(id: string, organizationId: string): Promise<Invoice>
  /** Stamps `paidAt` + `paidAmountCents` and transitions to paid. Throws on draft. */
  markPaid(id: string, organizationId: string, paidAmountCents?: number): Promise<Invoice>
  /**
   * W2-3 / EH-G: record a payment ledger entry. Recomputes invoice
   * balance and transitions status to `paid` (zero balance) or
   * `partial` (non-zero, with at least one payment). Emits
   * `invoiceMarkedPaid` IFF fully paid; `invoicePartialPaid` otherwise.
   * The W1-4 property auto-transition is preserved: full payment of
   * the LAST open invoice triggers `property.paid`.
   */
  recordPayment(input: {
    invoiceId: string
    organizationId: string
    amountCents: number
    method: import('./invoice-payment').InvoicePaymentMethod
    reference?: string | null
    notes?: string | null
    receivedAt?: string
    recordedByUserId?: string | null
  }): Promise<Invoice>
  /**
   * W2-3 / EH-G: transition to `voided` (terminal). Records `voidedAt`
   * + `voidedReason`. Emits `invoiceVoided`. Does NOT clear existing
   * payments — the ledger is append-only.
   */
  voidInvoice(input: {
    invoiceId: string
    organizationId: string
    reason: string
  }): Promise<Invoice>
}

// ----------------------------------------------------------------------------
// UI helpers.
// ----------------------------------------------------------------------------
export const INVOICE_VIEW_LABEL: Record<InvoiceView, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partial',
  paid: 'Paid',
  voided: 'Voided',
  overdue: 'Overdue',
}

/**
 * shared/contracts/quote.ts — Quote domain (E5).
 *
 * # Decisions (ADR-0008)
 *   - All money is integer cents (CONVENTIONS §Money). Never floats.
 *     Totals are derived in `shared/utils/money.ts` and re-derived
 *     server-side on persist; UI shows them but cannot lie about them.
 *   - A quote belongs to a `propertyId` (the unit of customer work) and
 *     optionally references the `assessmentId` it was generated from
 *     (E5-S2 pre-population). The link is nullable so a GC can write a
 *     quote before any assessment exists (rare, but real).
 *   - Status enum mirrors the screen flow Drew sketched: draft → sent →
 *     accepted | rejected | expired. We deliberately omit `revised`; a
 *     revision is a brand-new quote that supersedes the old one (audit
 *     log + customer email already cover that workflow).
 *   - Line items are denormalised onto the quote (no separate line-item
 *     service). Quotes are append-only after `sent`; mutating a sent
 *     quote requires creating a new one. Storing items as JSONB on the
 *     row keeps reads cheap and matches the DB schema we'll wire in E0
 *     follow-up.
 *
 * # Decision cast down
 *   - Rejected: a separate `quote_line_items` table. Adds a join for
 *     every read with no upside at our scale (Drew expects 5–20 items
 *     per quote). Reconsider when an item-level audit trail is needed.
 *   - Rejected: storing `totalCents` only. We also keep `subtotalCents`,
 *     `taxCents`, and `markupCents` so the preview can show the breakdown
 *     without re-running the helper on every render.
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
export const QuoteStatusSchema = z.enum([
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
])
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>

// ----------------------------------------------------------------------------
// Line item — one row in the quote.
// ----------------------------------------------------------------------------
export const QuoteLineItemKindSchema = z.enum(['labor', 'material', 'other'])
export type QuoteLineItemKind = z.infer<typeof QuoteLineItemKindSchema>

export const QuoteLineItemSchema = z.object({
  id: UuidSchema,
  kind: QuoteLineItemKindSchema,
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitCostCents: MoneyCentsSchema,
  // Free-form note attached to the assessment field this item resolves
  // (E5-S2). Empty string when the item was added manually.
  sourceField: z.string().max(60).default(''),
})
export type QuoteLineItem = z.infer<typeof QuoteLineItemSchema>

// ----------------------------------------------------------------------------
// Totals — recomputed by `shared/utils/money.ts` and embedded on the row.
// ----------------------------------------------------------------------------
export const QuoteTotalsSchema = z.object({
  subtotalCents: MoneyCentsSchema,
  markupCents: MoneyCentsSchema,
  taxCents: MoneyCentsSchema,
  totalCents: MoneyCentsSchema,
})
export type QuoteTotals = z.infer<typeof QuoteTotalsSchema>

// ----------------------------------------------------------------------------
// Quote record.
// ----------------------------------------------------------------------------
export const QuoteSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    propertyId: UuidSchema,
    assessmentId: UuidSchema.nullable(),
    createdById: UuidSchema,
    quoteNumber: z.string().min(1).max(40),
    status: QuoteStatusSchema,
    issuedAt: z.string().datetime().nullable(),
    sentAt: z.string().datetime().nullable(),
    acceptedAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
    lineItems: z.array(QuoteLineItemSchema),
    // Markup is a percentage, e.g. 10 means 10%. Tax mirrors that.
    markupPercent: z.number().min(0).max(200),
    taxPercent: z.number().min(0).max(50),
    notes: z.string().nullable(),
    totals: QuoteTotalsSchema,
  })
  .merge(AuditFieldsSchema)
export type Quote = z.infer<typeof QuoteSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const QuoteCreateInputSchema = QuoteSchema.omit({
  id: true,
  quoteNumber: true,
  status: true,
  issuedAt: true,
  sentAt: true,
  acceptedAt: true,
  totals: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
})
export type QuoteCreateInput = z.infer<typeof QuoteCreateInputSchema>

export const QuoteListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  propertyId: UuidSchema.optional(),
  status: QuoteStatusSchema.optional(),
})
export type QuoteListInput = z.infer<typeof QuoteListInputSchema>

export const QuoteListOutputSchema = ListOutputSchema(QuoteSchema)
export type QuoteListOutput = z.infer<typeof QuoteListOutputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IQuoteService {
  list(input: QuoteListInput): Promise<QuoteListOutput>
  get(id: string, organizationId: string): Promise<Quote | null>
  create(input: QuoteCreateInput): Promise<Quote>
  /**
   * Transition the quote to `sent` — stamps `sentAt`. Idempotent: a
   * second call returns the same row unchanged.
   */
  markSent(id: string, organizationId: string): Promise<Quote>
  /**
   * Transition a `sent` quote to `accepted` — stamps `acceptedAt`.
   * Idempotent: a second call returns the same row unchanged. Throws
   * if called on a draft (must be sent first).
   */
  markAccepted(id: string, organizationId: string): Promise<Quote>
}

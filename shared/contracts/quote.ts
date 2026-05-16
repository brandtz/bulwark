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
// Tier enum (W2-3 / EH-G).
// ----------------------------------------------------------------------------
// Tiered "good/better/best" pricing is the GC sales playbook standard.
// `custom` is the fallback for one-off quotes (the existing single-tier
// flow). Defaults to `custom` so legacy rows continue to validate.
export const QuoteTierSchema = z.enum(['good', 'better', 'best', 'custom'])
export type QuoteTier = z.infer<typeof QuoteTierSchema>

// ----------------------------------------------------------------------------
// Rejection reason taxonomy (W2-3 / EH-G).
// ----------------------------------------------------------------------------
// Enumerated reasons feed the win/loss report. `other` is the free-text
// escape hatch backed by `rejectedReason`.
export const QuoteRejectedReasonCodeSchema = z.enum([
  'price',
  'scope',
  'timing',
  'competitor',
  'unresponsive',
  'other',
])
export type QuoteRejectedReasonCode = z.infer<typeof QuoteRejectedReasonCodeSchema>

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
  // W2-3 / EH-G additions. All optional so legacy line items keep
  // validating without rewrites. Code reads with `?? <default>`.
  /** Per-line discount in basis points (1 bp = 0.01%). Default 0. */
  discountBps: z.number().int().min(0).max(10_000).optional(),
  /** Optional line — default-excluded from totals unless `optionalSelected`. */
  optional: z.boolean().optional(),
  /** When `optional=true`, whether the customer accepted the line. */
  optionalSelected: z.boolean().optional(),
  /** Free-text note attached to the line (visible to customer). */
  notes: z.string().max(500).nullable().optional(),
  /** Slug for grouping in the quote PDF (e.g. `roofing` / `defensible-space`). */
  categorySlug: z.string().max(60).nullable().optional(),
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
    // W2-3 / EH-G additions. Optional so existing seed rows + tests
    // keep validating; service code reads with `?? <default>`.
    /** Tier this quote represents in a tiered offer. Defaults to `custom`. */
    tier: QuoteTierSchema.optional(),
    /** Groups revisions of the same offer. Null = standalone. */
    revisionGroupId: UuidSchema.nullable().optional(),
    /** The quote this one supersedes (null on v1). */
    parentQuoteId: UuidSchema.nullable().optional(),
    /** Monotonically incremented within a `revisionGroupId`. Defaults to 1. */
    revisionNumber: z.number().int().positive().optional(),
    /** Hard expiry date (date-only ISO; UI defaults from org settings). */
    expiryDate: z.string().datetime().nullable().optional(),
    /** Free-text rejection notes (paired with `rejectedReasonCode`). */
    rejectedReason: z.string().max(1000).nullable().optional(),
    rejectedReasonCode: QuoteRejectedReasonCodeSchema.nullable().optional(),
    /** Notes visible on the customer-facing quote PDF. */
    customerVisibleNotes: z.string().max(2000).nullable().optional(),
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
  /**
   * W2-3 / EH-G: clone an existing quote into a new draft revision,
   * sharing `revisionGroupId` and incrementing `revisionNumber`. The
   * source quote remains untouched (per ADR-0020: revisions are a
   * superseding fork, never an in-place mutation).
   */
  revise(id: string, organizationId: string): Promise<Quote>
  /**
   * W2-3 / EH-G: transition a `sent` quote to `rejected`, recording
   * `rejectedReason` + structured `rejectedReasonCode`. Emits
   * `quoteRejected`.
   */
  reject(input: {
    id: string
    organizationId: string
    reason: string
    reasonCode: QuoteRejectedReasonCode
  }): Promise<Quote>
  /**
   * W2-3 / EH-G: transition a single quote to `expired`. Manually
   * callable as the "Expire now" admin action; the W3-1 cron will
   * invoke this in batch from `expireBatch()`.
   */
  expire(id: string, organizationId: string): Promise<Quote>
  /**
   * W2-3 / EH-G: scan for `sent` quotes whose `expiryDate` is past
   * `nowIso` and transition each to `expired`. Returns the rows
   * mutated. Idempotent (already-expired rows are filtered out).
   */
  expireBatch(input: { organizationId: string; nowIso?: string }): Promise<Quote[]>
  /**
   * W3-4 / EH-N: sub portal — vendor signs an accept/decline on a
   * quote-request the GC sent for that sub's trades. Emits
   * `subQuoteResponded`. Does NOT transition the quote status itself
   * (admin still owns transitions) — it stamps a sub-side decision
   * for the admin to review.
   */
  respondToQuote(input: {
    id: string
    organizationId: string
    subcontractorId: string
    response: 'accepted' | 'declined'
    notes?: string
  }): Promise<{ quoteId: string; response: 'accepted' | 'declined' }>
}

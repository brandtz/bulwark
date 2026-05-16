/**
 * server/db/schema/quotes.ts — Quote domain (E5 / E11-S7).
 *
 * Line items + totals are denormalised onto the row as JSONB per the
 * contract decision (E5: "no separate quote_line_items table").
 */
import { pgTable, text, uuid, pgEnum, jsonb, integer, doublePrecision, timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { properties } from './properties'
import { assessments } from './assessments'
import { users } from './users'
import type { QuoteLineItem, QuoteTotals } from '../../../shared/contracts/quote'

export const quoteStatusEnum = pgEnum('quote_status', [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
])

/** W2-3 / EH-G — tiered quote pricing (good/better/best/custom). */
export const quoteTierEnum = pgEnum('quote_tier', ['good', 'better', 'best', 'custom'])

export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  assessmentId: uuid('assessment_id').references(() => assessments.id),
  createdById: uuid('created_by_id').notNull().references(() => users.id),
  quoteNumber: text('quote_number').notNull(),
  status: quoteStatusEnum('status').notNull().default('draft'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lineItems: jsonb('line_items').$type<QuoteLineItem[]>().notNull(),
  markupPercent: doublePrecision('markup_percent').notNull().default(0),
  taxPercent: doublePrecision('tax_percent').notNull().default(0),
  notes: text('notes'),
  // Totals embedded as JSONB so the read path is one row, no joins.
  totals: jsonb('totals').$type<QuoteTotals>().notNull(),
  // Mirror of totals.totalCents for cheap aggregations / list filters.
  totalCents: integer('total_cents').notNull().default(0),
  // W2-3 / EH-G — tiering + revisions + rejection metadata.
  tier: quoteTierEnum('tier').notNull().default('custom'),
  revisionGroupId: uuid('revision_group_id'),
  parentQuoteId: uuid('parent_quote_id'),
  revisionNumber: integer('revision_number').notNull().default(1),
  expiryDate: timestamp('expiry_date', { withTimezone: true }),
  rejectedReason: text('rejected_reason'),
  rejectedReasonCode: text('rejected_reason_code'),
  customerVisibleNotes: text('customer_visible_notes'),
  ...auditColumns,
})

export type Quote = typeof quotes.$inferSelect
export type NewQuote = typeof quotes.$inferInsert

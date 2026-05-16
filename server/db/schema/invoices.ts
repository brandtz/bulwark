/**
 * server/db/schema/invoices.ts — Invoice domain (E8 / E11-S11).
 *
 * Same JSONB-line-items pattern as quotes. `paidAmountCents` is
 * separate from `totals.totalCents` so partial-pay flows (sponsor
 * mentioned retainers) round-trip cleanly.
 */
import { pgTable, text, uuid, pgEnum, jsonb, integer, doublePrecision, timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { properties } from './properties'
import { workOrders } from './work_orders'
import { quotes } from './quotes'
import type { InvoiceLineItem, InvoiceTotals } from '../../../shared/contracts/invoice'

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'partial',
  'paid',
  'voided',
])

/** W2-3 / EH-G — payment terms enum (drives `dueDate` defaulting). */
export const invoiceTermsEnum = pgEnum('invoice_terms', [
  'due_on_receipt',
  'net_15',
  'net_30',
  'net_60',
  'custom',
])

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  workOrderId: uuid('work_order_id').references(() => workOrders.id),
  quoteId: uuid('quote_id').references(() => quotes.id),
  invoiceNumber: text('invoice_number').notNull(),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paidAmountCents: integer('paid_amount_cents').notNull().default(0),
  lineItems: jsonb('line_items').$type<InvoiceLineItem[]>().notNull(),
  markupPercent: doublePrecision('markup_percent').notNull().default(0),
  taxPercent: doublePrecision('tax_percent').notNull().default(0),
  notes: text('notes'),
  totals: jsonb('totals').$type<InvoiceTotals>().notNull(),
  totalCents: integer('total_cents').notNull().default(0),
  // W2-3 / EH-G — deposits, retainage, terms, void.
  depositRequiredCents: integer('deposit_required_cents').notNull().default(0),
  depositReceivedCents: integer('deposit_received_cents').notNull().default(0),
  retainageBps: integer('retainage_bps').notNull().default(0),
  retainageReleasedCents: integer('retainage_released_cents').notNull().default(0),
  terms: invoiceTermsEnum('terms').notNull().default('net_30'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedReason: text('voided_reason'),
  ...auditColumns,
})

export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert

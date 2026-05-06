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

export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid'])

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
  ...auditColumns,
})

export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert

/**
 * server/db/schema/invoice_payments.ts — partial-payment ledger (W2-3 /
 * EH-G / ADR-0020).
 *
 * # Why this table exists
 *
 * Before this slice an invoice carried a single `(paidAt, paidAmountCents)`
 * pair, so two cheques flattened into one row and the partial-pay path was
 * broken. `invoice_payments` is the canonical ledger: one row per receipt
 * (cheque, ACH trace, card capture, …). The invoice's status (partial vs.
 * paid) is derived from Σ payments in `IInvoiceService.recordPayment`.
 *
 * # Decisions (ADR-0008, ADR-0020)
 *   - Refunds are recorded as a payment row with **negative** `amountCents`
 *     rather than a separate `refunds` table. Cleaner reconciliation —
 *     a single SUM produces balance owed.
 *   - `method` is a small `text` column rather than a pgEnum so we can
 *     extend without migrations when Stripe lands in Phase 2. The Zod
 *     boundary check on the contract keeps the universe tight at runtime.
 *   - `recordedByUserId` nullable: an automated reconciliation job (Phase 2
 *     ACH ingest) may insert payments without a user actor.
 *
 * # Decision cast down
 *   - Rejected: per-line allocation of a payment across invoice line
 *     items. Customers tendering against specific line items is rare; we
 *     keep payments at the invoice envelope level for v1.
 */
import { pgTable, text, uuid, integer, timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { invoices } from './invoices'
import { users } from './users'

export const invoicePayments = pgTable('invoice_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  /** Signed cents — negative = refund. */
  amountCents: integer('amount_cents').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  method: text('method').notNull(),
  reference: text('reference'),
  notes: text('notes'),
  recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
  ...auditColumns,
})

export type InvoicePaymentRow = typeof invoicePayments.$inferSelect
export type NewInvoicePaymentRow = typeof invoicePayments.$inferInsert

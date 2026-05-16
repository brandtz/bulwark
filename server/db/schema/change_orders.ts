/**
 * server/db/schema/change_orders.ts — change order ledger (W2-3 / EH-G /
 * ADR-0020).
 *
 * # Why this table exists
 *
 * A change order is the contracted way for a GC to add (or credit) work
 * AFTER the original quote was accepted. Without it the audit trail
 * collapses ("did the customer agree to this $4k bump?"). The CO carries
 * its own approval timestamp, approver name + (optional) signature URL,
 * and a signed `amountCents` so credits are first-class.
 *
 * # Decisions (ADR-0008, ADR-0020)
 *   - Both `workOrderId` and `invoiceId` are nullable. At-least-one is
 *     enforced at the service layer (not via DB constraint) so a CO can
 *     exist as `proposed` before the GC decides whether to attach it
 *     to the active WO or a future invoice.
 *   - `amountCents` is signed `integer` (no `centsColumn` helper because
 *     that asserts non-negative).
 *   - Status is a `text` column with Zod-enforced enum. Same rationale as
 *     payment.method — Phase 2 may introduce `auto_approved` for online
 *     signature flows.
 *
 * # Decision cast down
 *   - Rejected: multi-line change orders. Real-world COs are typically a
 *     single delta line ("Add gutter guards: +$1,200"). Storing the
 *     amount inline keeps the math obvious and the read path one row.
 */
import { pgTable, text, uuid, integer, timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { workOrders } from './work_orders'
import { invoices } from './invoices'
import { users } from './users'

export const changeOrders = pgTable('change_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  workOrderId: uuid('work_order_id').references(() => workOrders.id),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  /** Signed cents — negative = credit. */
  amountCents: integer('amount_cents').notNull(),
  /** `proposed | approved | rejected` (Zod-enforced). */
  status: text('status').notNull().default('proposed'),
  proposedByUserId: uuid('proposed_by_user_id').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  approvedByName: text('approved_by_name'),
  signatureUrl: text('signature_url'),
  rejectedReason: text('rejected_reason'),
  ...auditColumns,
})

export type ChangeOrderRow = typeof changeOrders.$inferSelect
export type NewChangeOrderRow = typeof changeOrders.$inferInsert

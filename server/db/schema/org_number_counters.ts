/**
 * server/db/schema/org_number_counters.ts — race-safe document numbering
 * (WP-L06 S2, epic L06 key decisions).
 *
 * One row per (organization, entity, period). Allocation is
 * `UPDATE ... SET last_seq = last_seq + 1 RETURNING last_seq` inside the same
 * transaction as the insert, so concurrent creates in one org serialize on the
 * row lock instead of racing a COUNT(*). `period` is the UTC year when the
 * org's number format contains `{year}`, otherwise 0 (a single running series).
 * The per-org UNIQUE indexes on quotes/invoices/work_orders are the backstop.
 */
import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const orgNumberCounters = pgTable(
  'org_number_counters',
  {
    organizationId: uuid('organization_id').notNull(),
    /** quote | invoice | work_order */
    entity: text('entity').notNull(),
    period: integer('period').notNull(),
    lastSeq: integer('last_seq').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.entity, t.period] }),
  }),
)

export type OrgNumberCounterRow = typeof orgNumberCounters.$inferSelect

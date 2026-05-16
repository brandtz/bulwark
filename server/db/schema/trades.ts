/**
 * server/db/schema/trades.ts — per-tenant trades catalog
 * (Wave 1B / EH-H Part A / W1-3).
 *
 * See `shared/contracts/trade.ts` for the why. Mirrors the `programs`
 * shape: org-scoped slug uniqueness, soft-delete, `isBuiltin` flag
 * blocks hard delete.
 */
import { boolean, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const trades = pgTable(
  'trades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('trades_org_slug_unique').on(t.organizationId, t.slug),
  }),
)

export type TradeRow = typeof trades.$inferSelect
export type NewTradeRow = typeof trades.$inferInsert

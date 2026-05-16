/**
 * server/db/schema/saved_views.ts — per-user / per-org saved list views
 * (W3-5 / EH-P / ADR-0033).
 *
 * # Decisions (ADR-0008, ADR-0033)
 *   - One row per (org, user|null, entityType, name). `userId IS NULL`
 *     denotes an org-shared view; otherwise the row belongs to that user.
 *   - `entityType` is text (free-form) — not an enum — so adding new
 *     list pages (inspections, sub workload) doesn't require a
 *     migration. The contract layer constrains the valid values.
 *   - `filters` is JSONB — opaque to the DB. The page that owns the
 *     view interprets the keys. We sanity-cap the size at the contract
 *     layer; the DB stays permissive.
 *   - `isDefault` is per (org, user, entityType). Setting one row's
 *     `isDefault=true` clears the flag on siblings inside the same
 *     transaction (service-level invariant; no partial unique index
 *     because nullable userId makes the predicate awkward in Postgres
 *     across multiple roles).
 *   - Soft delete via standard audit columns; the service filters
 *     `deletedAt IS NULL` on every read.
 */
import { pgTable, text, uuid, jsonb, boolean, index } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { users } from './users'

export const savedViews = pgTable(
  'saved_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    /** `NULL` = shared org-wide view. Otherwise the owning user. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    name: text('name').notNull(),
    filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
    sortBy: text('sort_by'),
    sortDir: text('sort_dir'),
    isDefault: boolean('is_default').notNull().default(false),
    ...auditColumns,
  },
  (t) => ({
    orgUserEntityIdx: index('saved_views_org_user_entity_idx').on(
      t.organizationId,
      t.userId,
      t.entityType,
    ),
  }),
)

export type SavedViewRow = typeof savedViews.$inferSelect
export type NewSavedViewRow = typeof savedViews.$inferInsert

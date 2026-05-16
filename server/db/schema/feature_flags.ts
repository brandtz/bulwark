/**
 * server/db/schema/feature_flags.ts — runtime feature flags
 * (Wave 2 / EH-H Part B / W2-4 / ADR-0021).
 *
 * # Decisions (ADR-0008, ADR-0021)
 *   - Flags are DATA, not const arrays. `organizationId = NULL` rows
 *     are the GLOBAL DEFAULT (one row per slug). `organizationId =
 *     <uuid>` rows are per-tenant OVERRIDES. The merge rule in
 *     `IFeatureFlagService.listForOrg` is "global default unless an
 *     org row exists for that slug".
 *   - `value` is plain text. Phase 1 flags are boolean-ish ("on"/"off")
 *     but the column accepts any string so a future flag can be e.g.
 *     `'5'` (% rollout) or `'{"tiers":["pro"]}'`. Zod validates the
 *     shape at the contract layer.
 *   - The unique index is `(coalesce(organization_id, '0…0'), slug)` —
 *     i.e. NULL orgId collapses to a sentinel so the DB enforces "one
 *     global default per slug" alongside "one override per org per slug".
 *
 * # Decision cast down
 *   - Rejected: JSONB column for `value`. Adds parse ceremony for the
 *     99% boolean case. Zod refinement at the contract is enough.
 *   - Rejected: putting flags inside `org_settings` JSONB. Querying
 *     "every org that has `compliance.async-jobs` overridden to off"
 *     becomes a JSONB scan; a flat table is grep-able.
 */
import { pgTable, text, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { auditColumns } from './_shared'
import { users } from './users'

export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** null = global default; non-null = per-tenant override. */
    organizationId: uuid('organization_id'),
    slug: text('slug').notNull(),
    value: text('value').notNull(),
    description: text('description'),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    // Treat NULL orgId as the zero-UUID sentinel so we get exactly one
    // global default per slug AND one override per (org, slug).
    orgSlugUnique: uniqueIndex('feature_flags_org_slug_unique')
      .on(sql`coalesce(${t.organizationId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.slug),
  }),
)

export type FeatureFlagRow = typeof featureFlags.$inferSelect
export type NewFeatureFlagRow = typeof featureFlags.$inferInsert

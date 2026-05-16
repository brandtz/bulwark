/**
 * server/db/schema/labels.ts — per-tenant CMS label registry (EH-B / W1-2).
 *
 * What this file does:
 *   - Stores admin-authored OVERRIDES for user-facing copy strings
 *     (status names, trade names, role labels, program copy, doc footers,
 *     email subjects). One row per `(organizationId, namespace, key, locale)`
 *     overrides one default that lives in `shared/labels/defaults.ts`.
 *   - The composable `useLabel()` reads the per-tenant flat map of overrides
 *     on first call and falls back to the code-defined defaults when no
 *     override exists.
 *
 * Decisions captured here (ADR-0008, ADR-0014):
 *   - `(namespace, key)` composite identity — not flat dotted strings —
 *     so the editor can group by namespace tab and bulkUpsert against a
 *     single namespace without parsing strings.
 *   - `locale` column even though Phase 1 is en-US only. A label registry
 *     without locale forecloses i18n; adding it later is a destructive
 *     migration. Default `'en-US'`; unique constraint includes locale.
 *   - Soft-delete via `deletedAt` (per CONVENTIONS) so "reset to default"
 *     can revive history on re-create rather than leaving audit gaps.
 *   - `description` is admin metadata — purely for the editor UI ("what is
 *     this label for?"). NOT user-visible.
 *
 * Decisions NOT taken:
 *   - We considered a pgEnum for `namespace` and rejected it. Future
 *     namespaces ship with code (a Wave 2 epic adds `dispatch.*` etc.);
 *     a Postgres enum requires a migration on every addition. Zod is the
 *     boundary check; the DB stores text.
 *   - We considered seeding every default row at install. Rejected: the
 *     source of truth for defaults must be code (`DEFAULT_LABELS`) so a
 *     code refactor doesn't drift from a stale DB seed.
 *
 * Maintenance notes:
 *   - When adding a new namespace, also extend `LabelNamespaceSchema` in
 *     `shared/contracts/label.ts` AND add entries to `DEFAULT_LABELS`.
 */
import { pgTable, text, uuid, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const labels = pgTable(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    locale: text('locale').notNull().default('en-US'),
    value: text('value').notNull(),
    description: text('description'),
    ...auditColumns,
  },
  (t) => ({
    // One override per (org, namespace, key, locale) — composite uniqueness
    // is the contract the bulkUpsert RPC depends on.
    uniqByScope: uniqueIndex('labels_org_ns_key_locale_uq')
      .on(t.organizationId, t.namespace, t.key, t.locale),
    // Read path: composable fetches the entire org+locale map at once.
    byOrgLocale: index('labels_org_locale_idx').on(t.organizationId, t.locale),
  }),
)

export type LabelRow = typeof labels.$inferSelect
export type NewLabelRow = typeof labels.$inferInsert

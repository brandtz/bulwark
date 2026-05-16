/**
 * server/db/schema/permissions.ts — per-tenant permission overrides
 * (W2-5 / EH-I-G / ADR-0025).
 *
 * # Decisions (ADR-0025-granular-permissions / ADR-0008)
 *   - The defaults table-of-record is in code
 *     (`shared/permissions/catalog.ts`). The DB stores ONLY overrides
 *     keyed by `(organizationId, role, permissionSlug)`. Nullable
 *     `organizationId` reserves room for a future platform-global
 *     override; v1 only writes per-org rows.
 *   - `allowed` is a 3-state effectively: row missing → fall back to
 *     catalog default; row present + `allowed=true` → grant; row
 *     present + `allowed=false` → deny.
 *   - Slug is free-text. The catalog enumerates the ~30 v1 slugs
 *     (property.create, quote.send, …); future slugs land via a
 *     code change to `shared/permissions/catalog.ts` + a release —
 *     no migration needed.
 *
 * # Decision cast down
 *   - Rejected: a `permission_slugs` lookup table. Adds an FK
 *     constraint that has to be migrated every time a new slug
 *     ships, which is the opposite of the catalog-in-code approach
 *     we adopted for trades + statuses already.
 *   - Rejected: per-USER overrides. v1 keeps overrides at the role
 *     level. Per-user grants are a Phase 2 cleanup task once we
 *     have customer demand for it.
 */
import { boolean, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { roleEnum } from './users'
import { auditColumns } from './_shared'

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nullable for a future platform-global override. v1 always writes a concrete org id. */
    organizationId: uuid('organization_id'),
    role: roleEnum('role').notNull(),
    permissionSlug: text('permission_slug').notNull(),
    allowed: boolean('allowed').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({
    triple: uniqueIndex('permissions_triple_unique').on(t.organizationId, t.role, t.permissionSlug),
  }),
)

export type PermissionOverride = typeof permissions.$inferSelect
export type NewPermissionOverride = typeof permissions.$inferInsert

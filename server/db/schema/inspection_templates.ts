/**
 * server/db/schema/inspection_templates.ts — inspection template engine
 * (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Decisions (ADR-0008, ADR-0013, ADR-0019)
 *   - The wildfire-specific assessment form is being generalised into a
 *     data-driven inspection template engine. A template lives at the
 *     org level and (optionally) binds to one program. When `programId`
 *     is null the template is org-wide / unbound — useful for ad-hoc
 *     templates an admin authors directly without going through a
 *     program. When `programId` is set, the program's
 *     `programs.inspectionTemplateId` FK points at the version-1 row
 *     (set by the W1-1 hook + the bootstrap in W2-2's seed).
 *   - `version` exists alongside `(orgId, programId, slug)` uniqueness so
 *     editing a published template clones a new row instead of mutating
 *     historical inspections' captured shape. Inspections snapshot the
 *     template version at submit so re-rendering them years later still
 *     uses the original field set.
 *   - `isBuiltin=true` is set for the wildfire defaults seeded via
 *     `bootstrap()`. Built-ins are editable (admins can rename, add
 *     fields, etc.) but cannot be hard-deleted by the service layer —
 *     they're the only template that the legacy `assessments` table can
 *     migrate into during Wave 4. Hard delete would orphan history.
 *
 * # Decision cast down
 *   - Rejected: a single global template catalog with per-org "enable"
 *     rows. Tenants must own their templates outright; otherwise a
 *     platform-level edit would break per-tenant historical artefacts.
 *   - Rejected: encoding sections inline as JSONB on the template row.
 *     Sections need their own sort order, conditional visibility, and
 *     "is repeatable" semantics — a child table makes editor UX, query
 *     ergonomics, and integrity checks dramatically cheaper.
 */
import { pgTable, text, uuid, boolean, integer, uniqueIndex } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { programs } from './programs'

export const inspectionTemplates = pgTable(
  'inspection_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    // Nullable: a template can be unbound from a specific program.
    programId: uuid('program_id').references(() => programs.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    ...auditColumns,
  },
  (t) => ({
    orgProgramSlugVersionUnique: uniqueIndex('inspection_templates_unique').on(
      t.organizationId, t.programId, t.slug, t.version,
    ),
  }),
)

export type InspectionTemplate = typeof inspectionTemplates.$inferSelect
export type NewInspectionTemplate = typeof inspectionTemplates.$inferInsert

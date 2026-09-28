/**
 * server/db/schema/building_sections.ts — sub-areas of a building (W2-1 / EH-E).
 *
 * # Decisions (ADR-0008, ADR-0018)
 *   - Sections are the granularity at which photos / measurements / line
 *     items pin: "North wall — 412 sq ft of fiber cement siding",
 *     "Master bath", "Front deck". Inspection templates and quotes can
 *     reference a section to tie line items to a discrete area without
 *     blowing up the parent building entity.
 *   - `kind` text not enum (same reasoning as `buildings.kind`).
 *   - Soft-delete only via deletedAt — historical inspection responses
 *     may still reference removed sections.
 */
import { pgTable, text, uuid, integer, index } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const buildingSections = pgTable(
  'building_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,

    buildingId: uuid('building_id').notNull(),

    label: text('label').notNull(),
    // 'room' | 'exterior_face' | 'deck' | 'roof' | 'other'
    kind: text('kind').notNull().default('other'),

    squareFeet: integer('square_feet'),
    notes: text('notes'),

    sortOrder: integer('sort_order').notNull().default(0),

    ...auditColumns,
  },
  (t) => ({
    // WP-L06 S5: org-scoped list / lookup indexes (docs/DATA_LAYER.md).
    orgBuilding: index('building_sections_org_building_idx').on(t.organizationId, t.buildingId),
  }),
)

export type BuildingSection = typeof buildingSections.$inferSelect
export type NewBuildingSection = typeof buildingSections.$inferInsert

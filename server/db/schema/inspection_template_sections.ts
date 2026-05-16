/**
 * server/db/schema/inspection_template_sections.ts — section rows
 * inside an inspection template (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Decisions (ADR-0008, ADR-0019)
 *   - A section groups related fields (e.g. "Zone 0", "Roof"). The
 *     editor UI renders one collapsible card per section.
 *   - `isRepeatable=true` declares "instances of this section can be
 *     stamped multiple times per inspection." The form UI surfaces an
 *     `+ Add another <repeatableLabel>` button; each stamped instance
 *     gets a deterministic `<sectionSlug>-<n>` key on responses. The
 *     wildfire defaults use this for roof faces, decks, and
 *     outbuildings — a property can have any number of any of those.
 *   - Section-level conditional visibility (`conditionalOnFieldSlug` +
 *     `conditionalOnValue`) lets an admin hide a whole section unless a
 *     field elsewhere has a specific value (e.g. only show "Solar
 *     panels" section when "Has solar?" is true). Field-level
 *     conditionals exist on the field row too.
 *
 * # Decision cast down
 *   - Rejected: conditional visibility as a JSONB rule blob. A single
 *     field-slug + value pair covers ~95% of the cases an inspection
 *     admin actually wants; richer rule kinds can layer onto a future
 *     `conditionalRule jsonb` column without a destructive migration.
 */
import { pgTable, text, uuid, boolean, integer } from 'drizzle-orm/pg-core'
import { auditColumns } from './_shared'
import { inspectionTemplates } from './inspection_templates'

export const inspectionTemplateSections = pgTable('inspection_template_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => inspectionTemplates.id),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isRepeatable: boolean('is_repeatable').notNull().default(false),
  repeatableLabel: text('repeatable_label'),
  conditionalOnFieldSlug: text('conditional_on_field_slug'),
  conditionalOnValue: text('conditional_on_value'),
  ...auditColumns,
})

export type InspectionTemplateSection = typeof inspectionTemplateSections.$inferSelect
export type NewInspectionTemplateSection = typeof inspectionTemplateSections.$inferInsert

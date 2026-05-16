/**
 * server/db/schema/inspections.ts — inspections + responses
 * (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Decisions (ADR-0008, ADR-0013, ADR-0019)
 *   - This is the NEW data-driven inspection model. It ships alongside
 *     `assessments` (NOT replacing) so:
 *       (a) existing wildfire assessments keep working without
 *           regression;
 *       (b) the compliance evaluator + PDF pipeline can transitionally
 *           consume either an old `assessments` row or a new
 *           `inspections` row;
 *       (c) Wave 4 will write a migration that promotes existing
 *           `assessments` rows into `inspections` rows whose
 *           templateId points at the wildfire built-in template, then
 *           drop `assessments` once the cutover is verified.
 *   - `templateVersion` is pinned at submit time so re-rendering an
 *     inspection always uses the original field set, even if the
 *     template has since been edited (new versions are clones, see
 *     `inspection_templates.ts`).
 *   - `status` mirrors the existing compliance-doc lifecycle vocabulary
 *     so the same status-pipeline editor (W1-3) can layer onto it:
 *       draft     — being filled out
 *       submitted — the inspector has hit submit; responses are frozen
 *       signed    — signature captured + PDF generation can proceed
 *       superseded — replaced by a later inspection on the same property
 *   - `buildingId` is nullable because W2-1's property-depth work owns
 *     the buildings table — we only reference its uuid here, not its
 *     schema. If buildings isn't shipped at the time this row is
 *     written, the inspection still binds at the property level.
 */
import { pgTable, text, uuid, integer, timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { properties } from './properties'
import { inspectionTemplates } from './inspection_templates'
import { programs } from './programs'

export const inspections = pgTable('inspections', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  buildingId: uuid('building_id'),
  templateId: uuid('template_id').notNull().references(() => inspectionTemplates.id),
  templateVersion: integer('template_version').notNull(),
  programId: uuid('program_id').references(() => programs.id),
  inspectorUserId: uuid('inspector_user_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signedByName: text('signed_by_name'),
  signatureUrl: text('signature_url'),
  status: text('status').notNull().default('draft'),
  summary: text('summary'),
  ...auditColumns,
})

export type Inspection = typeof inspections.$inferSelect
export type NewInspection = typeof inspections.$inferInsert

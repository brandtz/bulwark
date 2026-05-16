/**
 * server/db/schema/inspection_template_fields.ts — field-level config
 * (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Decisions (ADR-0008, ADR-0019)
 *   - `kind` is the discriminator that decides which primitive renders
 *     the input (text, longtext, number, currency, boolean, select,
 *     multiselect, date, photo, signature, passfail, rating). Adding a
 *     new kind is an enum extension here + a `<switch>` arm in the
 *     dynamic form renderer; NO schema migration is required to add new
 *     fields to a template, only when introducing a new KIND of field.
 *   - `evaluatorRule` is the W2-2-shipped extensibility lever for the
 *     compliance evaluator. Each rule shape is one of:
 *       { kind: 'must_be_one_of', allowed: string[] }
 *       { kind: 'must_be_true' }
 *       { kind: 'must_be_false' }
 *       { kind: 'min', value: number }
 *       { kind: 'max', value: number }
 *     New rule kinds can be added without a migration — the evaluator
 *     is a pure function over (response, rule) and unknown kinds short-
 *     circuit to "ok" so an older app can still process newer templates.
 *   - Field-level conditional visibility mirrors section-level: an
 *     admin can hide a field unless another field in the same section
 *     instance has a specific value.
 *   - Label fallback lives here AND in `useLabel().t('inspection.field',
 *     slug, label)` — admins overriding copy via the CMS labels editor
 *     win over the per-template fallback. Per ADR-0014.
 *
 * # Decision cast down
 *   - Rejected: storing `options` for select/multiselect on the field
 *     row as `text[]`. That denies a separate display label per option
 *     ({ value: 'class_a_asphalt', label: 'Class A asphalt' }). JSONB
 *     keeps the array of `{value,label}` objects without N extra rows.
 *   - Rejected: pushing photo + signature off into separate FK tables.
 *     They share the response-row model with everything else; the data
 *     URL or R2 object key lives in `valueJson`. Wave 3 owns the R2
 *     upload pipeline.
 */
import { pgTable, text, uuid, boolean, integer, jsonb } from 'drizzle-orm/pg-core'
import { auditColumns } from './_shared'
import { inspectionTemplateSections } from './inspection_template_sections'

/** Shape of an evaluator rule — denormalised here for the row mapper. */
export type EvaluatorRule =
  | { kind: 'must_be_one_of'; allowed: string[]; severity?: 'error' | 'warning'; message?: string }
  | { kind: 'must_be_true'; severity?: 'error' | 'warning'; message?: string }
  | { kind: 'must_be_false'; severity?: 'error' | 'warning'; message?: string }
  | { kind: 'min'; value: number; severity?: 'error' | 'warning'; message?: string }
  | { kind: 'max'; value: number; severity?: 'error' | 'warning'; message?: string }
  | { kind: 'required'; severity?: 'error' | 'warning'; message?: string }

export type FieldOption = { value: string; label: string }

export const inspectionTemplateFields = pgTable('inspection_template_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id').notNull().references(() => inspectionTemplateSections.id),
  slug: text('slug').notNull(),
  label: text('label').notNull(),
  kind: text('kind').notNull(),
  options: jsonb('options').$type<FieldOption[]>(),
  required: boolean('required').notNull().default(false),
  defaultValue: jsonb('default_value').$type<unknown>(),
  validationJson: jsonb('validation_json').$type<Record<string, unknown>>(),
  helpText: text('help_text'),
  placeholder: text('placeholder'),
  sortOrder: integer('sort_order').notNull().default(0),
  conditionalOnFieldSlug: text('conditional_on_field_slug'),
  conditionalOnValue: text('conditional_on_value'),
  evaluatorRule: jsonb('evaluator_rule').$type<EvaluatorRule>(),
  ...auditColumns,
})

export type InspectionTemplateField = typeof inspectionTemplateFields.$inferSelect
export type NewInspectionTemplateField = typeof inspectionTemplateFields.$inferInsert

/**
 * shared/contracts/inspection-template.ts — inspection template engine
 * (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Why this contract exists (ADR-0008, ADR-0013, ADR-0019)
 *
 * The legacy `assessments` table is a hardcoded wildfire form. Per the
 * GC-generalization mandate (D-H4) and ADR-0013, every program defines
 * its own inspection template — the field list, the conditional
 * visibility rules, the per-field evaluator rule. Templates are DATA,
 * not code. New programs (Roof Replacement, Kitchen Remodel, etc.) ship
 * as admin configuration without touching the runtime.
 *
 * A template is a tree: template → sections[] → fields[]. Sections may
 * be marked `isRepeatable` (e.g. "roof face" — one section instance per
 * face). Fields carry a `kind` discriminator (text, select, photo,
 * signature, …) and an optional `evaluatorRule` the compliance evaluator
 * walks to produce issues.
 *
 * # Why "templates" not "forms" / "questionnaires"
 *
 * - "Forms" conflicts with HTML forms throughout the UI.
 * - "Questionnaires" implies tick-the-box surveys; an inspection
 *   captures structured measurements + photos + signatures.
 * - "Templates" matches the existing `complianceDocTemplateId` pattern
 *   on programs.
 */
import { z } from 'zod'
import { AuditFieldsSchema, ListOutputSchema, PaginationInputSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Field kinds. Adding a new kind requires:
//   1. Append the new value to this enum.
//   2. Add a render arm to the InspectionForm renderer.
//   3. Optionally extend the evaluator with new EvaluatorRule kinds.
// No schema migration required.
// ----------------------------------------------------------------------------
export const FieldKindSchema = z.enum([
  'text',
  'longtext',
  'number',
  'currency',
  'boolean',
  'select',
  'multiselect',
  'date',
  'photo',
  'signature',
  'passfail',
  'rating',
])
export type FieldKind = z.infer<typeof FieldKindSchema>

export const FIELD_KIND_LABEL: Record<FieldKind, string> = {
  text: 'Short text',
  longtext: 'Long text',
  number: 'Number',
  currency: 'Currency',
  boolean: 'Yes / No',
  select: 'Single select',
  multiselect: 'Multi select',
  date: 'Date',
  photo: 'Photo',
  signature: 'Signature',
  passfail: 'Pass / fail',
  rating: 'Rating (1–5)',
}

// ----------------------------------------------------------------------------
// Field option (for select / multiselect).
// ----------------------------------------------------------------------------
export const FieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
})
export type FieldOption = z.infer<typeof FieldOptionSchema>

// ----------------------------------------------------------------------------
// Evaluator rules. Extensible via the discriminated union — adding a new
// `kind` here + an arm in `runEvaluatorRule()` covers any compliance shape
// without a schema change.
// ----------------------------------------------------------------------------
export const EvaluatorSeveritySchema = z.enum(['error', 'warning'])
export type EvaluatorSeverity = z.infer<typeof EvaluatorSeveritySchema>

export const EvaluatorRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('must_be_one_of'),
    allowed: z.array(z.string()).min(1),
    severity: EvaluatorSeveritySchema.optional(),
    message: z.string().optional(),
  }),
  z.object({
    kind: z.literal('must_be_true'),
    severity: EvaluatorSeveritySchema.optional(),
    message: z.string().optional(),
  }),
  z.object({
    kind: z.literal('must_be_false'),
    severity: EvaluatorSeveritySchema.optional(),
    message: z.string().optional(),
  }),
  z.object({
    kind: z.literal('min'),
    value: z.number(),
    severity: EvaluatorSeveritySchema.optional(),
    message: z.string().optional(),
  }),
  z.object({
    kind: z.literal('max'),
    value: z.number(),
    severity: EvaluatorSeveritySchema.optional(),
    message: z.string().optional(),
  }),
  z.object({
    kind: z.literal('required'),
    severity: EvaluatorSeveritySchema.optional(),
    message: z.string().optional(),
  }),
])
export type EvaluatorRule = z.infer<typeof EvaluatorRuleSchema>

// ----------------------------------------------------------------------------
// Field row.
// ----------------------------------------------------------------------------
export const InspectionTemplateFieldSchema = z.object({
  id: UuidSchema,
  sectionId: UuidSchema,
  slug: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/u, 'slug must be lowercase, underscores or hyphens'),
  label: z.string().min(1).max(200),
  kind: FieldKindSchema,
  options: z.array(FieldOptionSchema).nullable(),
  required: z.boolean(),
  defaultValue: z.unknown().nullable(),
  validationJson: z.record(z.unknown()).nullable(),
  helpText: z.string().nullable(),
  placeholder: z.string().nullable(),
  sortOrder: z.number().int(),
  conditionalOnFieldSlug: z.string().nullable(),
  conditionalOnValue: z.string().nullable(),
  evaluatorRule: EvaluatorRuleSchema.nullable(),
}).merge(AuditFieldsSchema)
export type InspectionTemplateField = z.infer<typeof InspectionTemplateFieldSchema>

// ----------------------------------------------------------------------------
// Section row.
// ----------------------------------------------------------------------------
export const InspectionTemplateSectionSchema = z.object({
  id: UuidSchema,
  templateId: UuidSchema,
  slug: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/u),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isRepeatable: z.boolean(),
  repeatableLabel: z.string().nullable(),
  conditionalOnFieldSlug: z.string().nullable(),
  conditionalOnValue: z.string().nullable(),
}).merge(AuditFieldsSchema)
export type InspectionTemplateSection = z.infer<typeof InspectionTemplateSectionSchema>

// Section + its fields, as returned by `getWithSections`.
export const InspectionTemplateSectionWithFieldsSchema = InspectionTemplateSectionSchema.extend({
  fields: z.array(InspectionTemplateFieldSchema),
})
export type InspectionTemplateSectionWithFields = z.infer<typeof InspectionTemplateSectionWithFieldsSchema>

// ----------------------------------------------------------------------------
// Template row.
// ----------------------------------------------------------------------------
export const InspectionTemplateSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  programId: UuidSchema.nullable(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/u),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  version: z.number().int().positive(),
  isActive: z.boolean(),
  isBuiltin: z.boolean(),
}).merge(AuditFieldsSchema)
export type InspectionTemplate = z.infer<typeof InspectionTemplateSchema>

// Hydrated tree returned by `getWithSections`.
export const InspectionTemplateWithSectionsSchema = InspectionTemplateSchema.extend({
  sections: z.array(InspectionTemplateSectionWithFieldsSchema),
})
export type InspectionTemplateWithSections = z.infer<typeof InspectionTemplateWithSectionsSchema>

// ----------------------------------------------------------------------------
// Inputs
// ----------------------------------------------------------------------------
export const InspectionTemplateCreateInputSchema = z.object({
  organizationId: UuidSchema,
  programId: UuidSchema.nullable().optional(),
  slug: InspectionTemplateSchema.shape.slug,
  name: InspectionTemplateSchema.shape.name,
  description: z.string().nullable().optional(),
})
export type InspectionTemplateCreateInput = z.infer<typeof InspectionTemplateCreateInputSchema>

export const InspectionTemplateUpdateInputSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  name: InspectionTemplateSchema.shape.name.optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})
export type InspectionTemplateUpdateInput = z.infer<typeof InspectionTemplateUpdateInputSchema>

export const InspectionTemplateListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  programId: UuidSchema.nullable().optional(),
  includeInactive: z.boolean().optional(),
})
export type InspectionTemplateListInput = z.infer<typeof InspectionTemplateListInputSchema>
export const InspectionTemplateListOutputSchema = ListOutputSchema(InspectionTemplateSchema)
export type InspectionTemplateListOutput = z.infer<typeof InspectionTemplateListOutputSchema>

export const SectionAddInputSchema = z.object({
  organizationId: UuidSchema,
  templateId: UuidSchema,
  slug: InspectionTemplateSectionSchema.shape.slug,
  name: InspectionTemplateSectionSchema.shape.name,
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isRepeatable: z.boolean().optional(),
  repeatableLabel: z.string().nullable().optional(),
  conditionalOnFieldSlug: z.string().nullable().optional(),
  conditionalOnValue: z.string().nullable().optional(),
})
export type SectionAddInput = z.infer<typeof SectionAddInputSchema>

export const FieldAddInputSchema = z.object({
  organizationId: UuidSchema,
  sectionId: UuidSchema,
  slug: InspectionTemplateFieldSchema.shape.slug,
  label: InspectionTemplateFieldSchema.shape.label,
  kind: FieldKindSchema,
  options: z.array(FieldOptionSchema).nullable().optional(),
  required: z.boolean().optional(),
  defaultValue: z.unknown().nullable().optional(),
  validationJson: z.record(z.unknown()).nullable().optional(),
  helpText: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  conditionalOnFieldSlug: z.string().nullable().optional(),
  conditionalOnValue: z.string().nullable().optional(),
  evaluatorRule: EvaluatorRuleSchema.nullable().optional(),
})
export type FieldAddInput = z.infer<typeof FieldAddInputSchema>

export const FieldUpdateInputSchema = z.object({
  organizationId: UuidSchema,
  fieldId: UuidSchema,
  label: InspectionTemplateFieldSchema.shape.label.optional(),
  kind: FieldKindSchema.optional(),
  options: z.array(FieldOptionSchema).nullable().optional(),
  required: z.boolean().optional(),
  defaultValue: z.unknown().nullable().optional(),
  validationJson: z.record(z.unknown()).nullable().optional(),
  helpText: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  conditionalOnFieldSlug: z.string().nullable().optional(),
  conditionalOnValue: z.string().nullable().optional(),
  evaluatorRule: EvaluatorRuleSchema.nullable().optional(),
})
export type FieldUpdateInput = z.infer<typeof FieldUpdateInputSchema>

// ----------------------------------------------------------------------------
// Service interface
// ----------------------------------------------------------------------------
export interface IInspectionTemplateService {
  list(input: InspectionTemplateListInput): Promise<InspectionTemplateListOutput>
  get(id: string, organizationId: string): Promise<InspectionTemplate | null>
  getWithSections(
    id: string,
    organizationId: string,
    version?: number,
  ): Promise<InspectionTemplateWithSections | null>
  create(input: InspectionTemplateCreateInput): Promise<InspectionTemplate>
  update(input: InspectionTemplateUpdateInput): Promise<InspectionTemplate>
  addSection(input: SectionAddInput): Promise<InspectionTemplateSection>
  addField(input: FieldAddInput): Promise<InspectionTemplateField>
  updateField(input: FieldUpdateInput): Promise<InspectionTemplateField>
  deleteField(input: { organizationId: string; fieldId: string }): Promise<void>
  deleteSection(input: { organizationId: string; sectionId: string }): Promise<void>
  activate(input: { organizationId: string; templateId: string; isActive: boolean }): Promise<void>
  /**
   * Idempotently seed the wildfire built-in template for the org if no
   * template exists for the wildfire program. Returns the resolved
   * template id (existing or newly created) so callers can stamp it onto
   * `programs.inspectionTemplateId`.
   */
  bootstrap(input: { organizationId: string; programId: string; programSlug: string }): Promise<{
    templateId: string
    created: boolean
  }>
}

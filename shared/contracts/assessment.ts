/**
 * shared/contracts/assessment.ts — assessment + compliance domain.
 *
 * # Decisions (ADR-0008)
 *   - The assessment is the GC's primary tool (Phase 1 mobile flow).
 *     Materials are modelled as small enums, not free-text, because the
 *     compliance evaluator (E4-S1) compares against an allow-list. Free
 *     text would push string normalisation into the evaluator and make
 *     `Settings → Compliance Standards` (E9) harder to ship.
 *   - `defensibleSpaceCleared` is a boolean rather than a distance enum
 *     for v1 — Drew's ground truth is "did they clear it or not." We can
 *     widen later without breaking existing assessments.
 *   - Compliance result is its own schema (not an enum on assessment) so
 *     the same evaluator can be re-run against new standards (E9) without
 *     mutating historical assessments. The result is a derivation, not a
 *     stored fact.
 *
 * # Decision cast down
 *   - Rejected: storing `requiredUpgrades` as serialized JSON inside the
 *     assessment record. Breaks the rule that derived data lives outside
 *     the source-of-truth row, and would force re-saves whenever
 *     standards change.
 *   - Rejected: a single freeform `materials` string. Hard to evaluate,
 *     hard to migrate, hostile to the standards config screen.
 */
import { z } from 'zod'
import { AuditFieldsSchema, ListOutputSchema, PaginationInputSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Material enums. Default Oregon-baseline allow-lists live with the
// evaluator (`shared/utils/compliance.ts`) so that Settings → Compliance
// Standards (E9) can override them per tenant without forking the schema.
// ----------------------------------------------------------------------------
export const RoofMaterialSchema = z.enum([
  'metal',
  'tile',
  'class_a_asphalt',
  'wood_shake',
  'standard_asphalt',
  'other',
])
export type RoofMaterial = z.infer<typeof RoofMaterialSchema>

export const SidingMaterialSchema = z.enum([
  'fiber_cement',
  'stucco',
  'metal',
  'masonry',
  'brick',
  'wood',
  'vinyl',
  'other',
])
export type SidingMaterial = z.infer<typeof SidingMaterialSchema>

export const EaveTypeSchema = z.enum(['enclosed', 'boxed', 'open', 'other'])
export type EaveType = z.infer<typeof EaveTypeSchema>

export const VentTypeSchema = z.enum(['ember_resistant', 'standard_mesh', 'unscreened', 'other'])
export type VentType = z.infer<typeof VentTypeSchema>

// ----------------------------------------------------------------------------
// Assessment record — the row a field user fills out per property.
// ----------------------------------------------------------------------------
export const AssessmentSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  assessedById: UuidSchema,
  assessedAt: z.string().datetime(),
  roofMaterial: RoofMaterialSchema,
  sidingMaterial: SidingMaterialSchema,
  eaveType: EaveTypeSchema,
  ventType: VentTypeSchema,
  defensibleSpaceCleared: z.boolean(),
  notes: z.string().nullable(),
}).merge(AuditFieldsSchema)
export type Assessment = z.infer<typeof AssessmentSchema>

export const AssessmentCreateInputSchema = AssessmentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
})
export type AssessmentCreateInput = z.infer<typeof AssessmentCreateInputSchema>

export const AssessmentListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  propertyId: UuidSchema.optional(),
})
export type AssessmentListInput = z.infer<typeof AssessmentListInputSchema>

export const AssessmentListOutputSchema = ListOutputSchema(AssessmentSchema)
export type AssessmentListOutput = z.infer<typeof AssessmentListOutputSchema>

// ----------------------------------------------------------------------------
// Compliance result — pure derivation from (assessment, standards).
// ----------------------------------------------------------------------------
export const ComplianceFieldSchema = z.enum([
  'roofMaterial',
  'sidingMaterial',
  'eaveType',
  'ventType',
  'defensibleSpaceCleared',
])
export type ComplianceField = z.infer<typeof ComplianceFieldSchema>

export const UpgradeItemSchema = z.object({
  field: ComplianceFieldSchema,
  currentValue: z.string(),
  requiredValue: z.string(),
  standardRef: z.string(),
})
export type UpgradeItem = z.infer<typeof UpgradeItemSchema>

export const ComplianceResultSchema = z.object({
  overallCompliant: z.boolean(),
  nonCompliantFields: z.array(ComplianceFieldSchema),
  requiredUpgrades: z.array(UpgradeItemSchema),
})
export type ComplianceResult = z.infer<typeof ComplianceResultSchema>

// ----------------------------------------------------------------------------
// Standards config — the per-tenant allow-list. E9 will let admins edit;
// E4 ships with the Oregon baseline (BULWARK_TECH §8).
// ----------------------------------------------------------------------------
export const ComplianceStandardsSchema = z.object({
  compliantRoofMaterials: z.array(RoofMaterialSchema).min(1),
  compliantSidingMaterials: z.array(SidingMaterialSchema).min(1),
  compliantEaveTypes: z.array(EaveTypeSchema).min(1),
  compliantVentTypes: z.array(VentTypeSchema).min(1),
  requireDefensibleSpace: z.boolean(),
})
export type ComplianceStandards = z.infer<typeof ComplianceStandardsSchema>

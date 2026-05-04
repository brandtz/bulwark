/**
 * shared/utils/compliance.ts — Oregon WUI compliance evaluator (E4-S1).
 *
 * # Decisions (ADR-0008)
 *   - Pure function. No I/O, no clock, no dependency injection. Given
 *     `(assessment, standards)` it returns a deterministic
 *     `ComplianceResult`. This is what makes it cheap to unit-test and
 *     safe to call from server endpoints, mocks, or live UI without
 *     worrying about side-effects.
 *   - Default standards are exported as `OREGON_DEFAULT_STANDARDS` so
 *     E4-S2/S3 (form + summary) and E9 (per-tenant override) can both
 *     consume them. The defaults match BULWARK_TECH §8 verbatim.
 *   - One upgrade item per failed field. We don't try to coalesce
 *     ("roof and siding both wrong"); the summary screen needs them
 *     listed individually with their own ORS/OAR reference.
 *   - `currentValue` is preserved as the raw enum slug (not humanised)
 *     so the UI can render its own label via PROPERTY-style maps.
 *     Easier to internationalise later than re-parsing prose.
 *
 * # Decision cast down
 *   - Rejected: throwing on non-compliant input. Compliance failure is
 *     a normal business outcome, not an error. Throwing would force
 *     every caller into try/catch and break the type-safe shape.
 *   - Rejected: returning a single boolean. Callers need the per-field
 *     breakdown for the summary screen and PDF export (E10).
 *   - Rejected: hard-coding the standard references inside the function
 *     body so they're "guaranteed up to date with the law" — the law
 *     doesn't change in commits. Inlining keeps the function pure and
 *     trivially auditable.
 */
import type {
  Assessment,
  AssessmentCreateInput,
  ComplianceField,
  ComplianceResult,
  ComplianceStandards,
  UpgradeItem,
} from '~~/shared/contracts/assessment'

// ----------------------------------------------------------------------------
// Default Oregon standards. BULWARK_TECH §8. Tenant overrides ship in E9.
// ----------------------------------------------------------------------------
export const OREGON_DEFAULT_STANDARDS: ComplianceStandards = {
  compliantRoofMaterials: ['metal', 'tile', 'class_a_asphalt'],
  compliantSidingMaterials: ['fiber_cement', 'stucco', 'metal', 'masonry', 'brick'],
  compliantEaveTypes: ['enclosed', 'boxed'],
  compliantVentTypes: ['ember_resistant'],
  requireDefensibleSpace: true,
}

// Standard references (ORS/OAR). Surfaced alongside each upgrade item so the
// summary view + generated PDFs can cite the authoritative source.
const STANDARD_REFS: Record<ComplianceField, string> = {
  roofMaterial: 'OAR 629-044-1030',
  sidingMaterial: 'OAR 629-044-1040',
  eaveType: 'OAR 629-044-1050',
  ventType: 'OAR 629-044-1060',
  defensibleSpaceCleared: 'ORS 477.061',
}

const REQUIRED_VALUE_TEXT: Record<ComplianceField, string> = {
  roofMaterial: 'Class A fire-rated material (metal, tile, or Class A asphalt)',
  sidingMaterial: 'Non-combustible siding (fiber cement, stucco, metal, masonry, or brick)',
  eaveType: 'Enclosed or boxed eaves',
  ventType: 'Ember-resistant vents (1/16" mesh or finer)',
  defensibleSpaceCleared: 'Defensible space cleared per state requirements',
}

// Subset of an assessment relevant to compliance — accepts a stored row OR an
// in-flight create input so callers don't have to manufacture the audit
// fields just to ask "would this pass?"
export type ComplianceInput = Pick<
  Assessment | AssessmentCreateInput,
  'roofMaterial' | 'sidingMaterial' | 'eaveType' | 'ventType' | 'defensibleSpaceCleared'
>

export function evaluateCompliance(
  input: ComplianceInput,
  standards: ComplianceStandards = OREGON_DEFAULT_STANDARDS,
): ComplianceResult {
  const upgrades: UpgradeItem[] = []

  if (!standards.compliantRoofMaterials.includes(input.roofMaterial)) {
    upgrades.push({
      field: 'roofMaterial',
      currentValue: input.roofMaterial,
      requiredValue: REQUIRED_VALUE_TEXT.roofMaterial,
      standardRef: STANDARD_REFS.roofMaterial,
    })
  }

  if (!standards.compliantSidingMaterials.includes(input.sidingMaterial)) {
    upgrades.push({
      field: 'sidingMaterial',
      currentValue: input.sidingMaterial,
      requiredValue: REQUIRED_VALUE_TEXT.sidingMaterial,
      standardRef: STANDARD_REFS.sidingMaterial,
    })
  }

  if (!standards.compliantEaveTypes.includes(input.eaveType)) {
    upgrades.push({
      field: 'eaveType',
      currentValue: input.eaveType,
      requiredValue: REQUIRED_VALUE_TEXT.eaveType,
      standardRef: STANDARD_REFS.eaveType,
    })
  }

  if (!standards.compliantVentTypes.includes(input.ventType)) {
    upgrades.push({
      field: 'ventType',
      currentValue: input.ventType,
      requiredValue: REQUIRED_VALUE_TEXT.ventType,
      standardRef: STANDARD_REFS.ventType,
    })
  }

  if (standards.requireDefensibleSpace && !input.defensibleSpaceCleared) {
    upgrades.push({
      field: 'defensibleSpaceCleared',
      currentValue: 'not cleared',
      requiredValue: REQUIRED_VALUE_TEXT.defensibleSpaceCleared,
      standardRef: STANDARD_REFS.defensibleSpaceCleared,
    })
  }

  return {
    overallCompliant: upgrades.length === 0,
    nonCompliantFields: upgrades.map((u) => u.field),
    requiredUpgrades: upgrades,
  }
}

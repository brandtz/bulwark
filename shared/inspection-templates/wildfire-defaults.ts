/**
 * shared/inspection-templates/wildfire-defaults.ts — built-in Wildfire
 * Retrofit inspection template (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Why these specific field slugs
 *
 * The legacy `shared/utils/compliance.ts` evaluator keys off these slugs:
 *   roof_material  / siding_material / eave_type / vent_type /
 *   defensible_space_cleared
 *
 * Wave 4 will migrate every existing `assessments` row into an
 * `inspections` row whose responses use these same slugs, so the
 * generic evaluator + the legacy hardcoded evaluator produce identical
 * results across the cutover. Renaming a slug here is therefore a
 * BREAKING change for historical data — don't do it without a paired
 * migration.
 *
 * # Section layout (per W2-2 scope)
 *   - Zone 0  — 0-5 ft non-combustible immediate zone.
 *   - Zone 1  — 5-30 ft intermediate zone.
 *   - Zone 2  — 30-100 ft extended zone.
 *   - Roof    — material + condition + penetrations.
 *   - Vents   — type + screen mesh + count.
 *   - Eaves   — type + soffit material.
 *   - Siding  — material + condition + clearance to grade.
 *   - Decks   — repeatable; one per deck attached to the structure.
 *
 * # Decisions cast down
 *   - Rejected: making every field `required: true`. Field crews often
 *     can't measure every dimension on the first pass; the evaluator
 *     surfaces missing required-only rules and the compliance summary
 *     handles partial inspections gracefully.
 *   - Rejected: separate Zone 0 / Zone 1 sections per side of house.
 *     The evaluator + PDF treat the zones as a single per-property
 *     measurement; expanding to N stamps is a future enhancement that
 *     repeatable sections already support without a schema change.
 */
import type { EvaluatorRule, FieldKind, FieldOption } from '../contracts/inspection-template'

export interface DefaultTemplateFieldDef {
  slug: string
  label: string
  kind: FieldKind
  required?: boolean
  helpText?: string
  options?: FieldOption[]
  evaluatorRule?: EvaluatorRule
  conditionalOnFieldSlug?: string
  conditionalOnValue?: string
}

export interface DefaultTemplateSectionDef {
  slug: string
  name: string
  description?: string
  isRepeatable?: boolean
  repeatableLabel?: string
  fields: DefaultTemplateFieldDef[]
}

export interface DefaultTemplate {
  slug: string
  name: string
  description: string
  sections: DefaultTemplateSectionDef[]
}

// Reused option sets — keep the slug enums identical to today's
// `shared/contracts/assessment.ts` enums so Wave 4 migration is a
// no-op rename.
const ROOF_OPTIONS: FieldOption[] = [
  { value: 'metal', label: 'Metal' },
  { value: 'tile', label: 'Tile' },
  { value: 'class_a_asphalt', label: 'Class A asphalt' },
  { value: 'standard_asphalt', label: 'Standard asphalt' },
  { value: 'wood_shake', label: 'Wood shake' },
  { value: 'other', label: 'Other' },
]
const SIDING_OPTIONS: FieldOption[] = [
  { value: 'fiber_cement', label: 'Fiber cement' },
  { value: 'stucco', label: 'Stucco' },
  { value: 'metal', label: 'Metal' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'brick', label: 'Brick' },
  { value: 'wood', label: 'Wood' },
  { value: 'vinyl', label: 'Vinyl' },
  { value: 'other', label: 'Other' },
]
const EAVE_OPTIONS: FieldOption[] = [
  { value: 'enclosed', label: 'Enclosed' },
  { value: 'boxed', label: 'Boxed' },
  { value: 'open', label: 'Open' },
  { value: 'other', label: 'Other' },
]
const VENT_OPTIONS: FieldOption[] = [
  { value: 'ember_resistant', label: 'Ember-resistant' },
  { value: 'standard_mesh', label: 'Standard mesh' },
  { value: 'unscreened', label: 'Unscreened' },
  { value: 'other', label: 'Other' },
]

export const DEFAULT_WILDFIRE_TEMPLATE: DefaultTemplate = {
  slug: 'wildfire-retrofit',
  name: 'Wildfire Retrofit Inspection',
  description:
    'Oregon WUI defensible-space + ignition-resistant construction inspection. Backwards-compatible with the legacy assessment form.',
  sections: [
    {
      slug: 'zone_0',
      name: 'Zone 0 — Immediate (0–5 ft)',
      description: 'Non-combustible perimeter directly against the structure.',
      fields: [
        {
          slug: 'defensible_space_cleared',
          label: 'Defensible space cleared',
          kind: 'boolean',
          required: true,
          helpText: 'Vegetation cleared per ORS 477.061.',
          evaluatorRule: { kind: 'must_be_true', message: 'Defensible space must be cleared.' },
        },
        {
          slug: 'mulch_present',
          label: 'Combustible mulch within 5 ft',
          kind: 'boolean',
          helpText: 'Bark, wood chips, pine straw count as combustible.',
          evaluatorRule: { kind: 'must_be_false', message: 'Remove combustible mulch within Zone 0.' },
        },
        {
          slug: 'zone_0_notes',
          label: 'Notes',
          kind: 'longtext',
        },
        {
          slug: 'zone_0_photos',
          label: 'Photos',
          kind: 'photo',
        },
      ],
    },
    {
      slug: 'zone_1',
      name: 'Zone 1 — Intermediate (5–30 ft)',
      description: 'Lean, clean, and green zone.',
      fields: [
        {
          slug: 'tree_spacing_ft',
          label: 'Minimum tree-canopy spacing (ft)',
          kind: 'number',
          evaluatorRule: { kind: 'min', value: 10, message: 'Tree canopies must be spaced ≥10 ft apart.' },
        },
        {
          slug: 'ladder_fuels_present',
          label: 'Ladder fuels present',
          kind: 'boolean',
          evaluatorRule: { kind: 'must_be_false', message: 'Remove ladder fuels (low branches, brush under trees).' },
        },
        {
          slug: 'zone_1_notes',
          label: 'Notes',
          kind: 'longtext',
        },
      ],
    },
    {
      slug: 'zone_2',
      name: 'Zone 2 — Extended (30–100 ft)',
      description: 'Reduced fuel load to slow advancing fire.',
      fields: [
        {
          slug: 'tree_canopy_continuous',
          label: 'Tree canopy continuous',
          kind: 'boolean',
          evaluatorRule: { kind: 'must_be_false', severity: 'warning', message: 'Break up continuous canopy where feasible.' },
        },
        {
          slug: 'dead_fuel_load',
          label: 'Dead fuel load rating',
          kind: 'rating',
          helpText: '1 = clean, 5 = heavy dead/down material.',
          evaluatorRule: { kind: 'max', value: 2, severity: 'warning', message: 'Reduce dead fuel load to 2 or less.' },
        },
      ],
    },
    {
      slug: 'roof',
      name: 'Roof',
      description: 'Material, condition, and penetrations.',
      fields: [
        {
          slug: 'roof_material',
          label: 'Roof material',
          kind: 'select',
          options: ROOF_OPTIONS,
          required: true,
          evaluatorRule: {
            kind: 'must_be_one_of',
            allowed: ['metal', 'tile', 'class_a_asphalt'],
            message: 'Roof must be Class A (metal, tile, or Class A asphalt). [OAR 629-044-1030]',
          },
        },
        {
          slug: 'roof_condition',
          label: 'Roof condition',
          kind: 'rating',
          helpText: '1 = needs replacement, 5 = excellent.',
        },
        {
          slug: 'gutters_clean',
          label: 'Gutters free of debris',
          kind: 'boolean',
          evaluatorRule: { kind: 'must_be_true', severity: 'warning', message: 'Clean gutters of needles/leaves.' },
        },
      ],
    },
    {
      slug: 'vents',
      name: 'Vents',
      description: 'Attic and crawlspace vent screening.',
      fields: [
        {
          slug: 'vent_type',
          label: 'Vent type',
          kind: 'select',
          options: VENT_OPTIONS,
          required: true,
          evaluatorRule: {
            kind: 'must_be_one_of',
            allowed: ['ember_resistant'],
            message: 'Vents must be ember-resistant (1/16" mesh or finer). [OAR 629-044-1060]',
          },
        },
        {
          slug: 'vent_count',
          label: 'Vent count',
          kind: 'number',
        },
      ],
    },
    {
      slug: 'eaves',
      name: 'Eaves',
      description: 'Soffit and overhang detail.',
      fields: [
        {
          slug: 'eave_type',
          label: 'Eave type',
          kind: 'select',
          options: EAVE_OPTIONS,
          required: true,
          evaluatorRule: {
            kind: 'must_be_one_of',
            allowed: ['enclosed', 'boxed'],
            message: 'Eaves must be enclosed or boxed. [OAR 629-044-1050]',
          },
        },
        {
          slug: 'soffit_material',
          label: 'Soffit material',
          kind: 'text',
        },
      ],
    },
    {
      slug: 'siding',
      name: 'Siding',
      description: 'Wall material and clearance.',
      fields: [
        {
          slug: 'siding_material',
          label: 'Siding material',
          kind: 'select',
          options: SIDING_OPTIONS,
          required: true,
          evaluatorRule: {
            kind: 'must_be_one_of',
            allowed: ['fiber_cement', 'stucco', 'metal', 'masonry', 'brick'],
            message: 'Siding must be non-combustible. [OAR 629-044-1040]',
          },
        },
        {
          slug: 'clearance_to_grade_in',
          label: 'Clearance to grade (in)',
          kind: 'number',
          evaluatorRule: { kind: 'min', value: 6, severity: 'warning', message: 'Maintain ≥6" clearance from siding to grade.' },
        },
      ],
    },
    {
      slug: 'deck',
      name: 'Deck',
      description: 'One stamp per attached deck or porch.',
      isRepeatable: true,
      repeatableLabel: 'deck',
      fields: [
        {
          slug: 'deck_material',
          label: 'Deck material',
          kind: 'select',
          options: [
            { value: 'composite', label: 'Composite' },
            { value: 'pressure_treated', label: 'Pressure-treated lumber' },
            { value: 'cedar', label: 'Cedar' },
            { value: 'redwood', label: 'Redwood' },
            { value: 'ipe', label: 'Ipe / hardwood' },
            { value: 'other', label: 'Other' },
          ],
          required: true,
        },
        {
          slug: 'deck_storage_beneath',
          label: 'Combustible storage beneath',
          kind: 'boolean',
          evaluatorRule: { kind: 'must_be_false', message: 'Remove combustible storage from under deck.' },
        },
      ],
    },
  ],
}

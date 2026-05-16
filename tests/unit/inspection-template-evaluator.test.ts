/**
 * tests/unit/inspection-template-evaluator.test.ts —
 * W2-2 (EH-F / ADR-0019) acceptance: rule kinds + conditional
 * visibility against the wildfire defaults.
 */
import { describe, it, expect } from 'vitest'
import { evaluateInspection } from '~~/shared/utils/inspection-evaluator'
import { DEFAULT_WILDFIRE_TEMPLATE } from '~~/shared/inspection-templates/wildfire-defaults'
import type {
  InspectionTemplateField,
  InspectionTemplateSection,
  InspectionTemplateWithSections,
} from '~~/shared/contracts/inspection-template'
import type { InspectionResponse } from '~~/shared/contracts/inspection'

function makeTemplate(): InspectionTemplateWithSections {
  // Hydrate a synthetic `InspectionTemplateWithSections` from the
  // built-in shape; ids don't matter for the evaluator.
  const sections: (InspectionTemplateSection & { fields: InspectionTemplateField[] })[] =
    DEFAULT_WILDFIRE_TEMPLATE.sections.map((s, sIdx) => ({
      id: `sec-${sIdx}`,
      templateId: 'tpl-1',
      slug: s.slug,
      name: s.name,
      description: null,
      sortOrder: sIdx,
      isRepeatable: s.isRepeatable ?? false,
      repeatableLabel: s.repeatableLabel ?? null,
      conditionalOnFieldSlug: null,
      conditionalOnValue: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      fields: s.fields.map((f, fIdx) => ({
        id: `fld-${sIdx}-${fIdx}`,
        sectionId: `sec-${sIdx}`,
        slug: f.slug,
        label: f.label,
        kind: f.kind,
        options: f.options ?? null,
        required: f.required ?? false,
        defaultValue: null,
        validationJson: null,
        helpText: f.helpText ?? null,
        placeholder: null,
        sortOrder: fIdx,
        conditionalOnFieldSlug: f.conditionalOnFieldSlug ?? null,
        conditionalOnValue: f.conditionalOnValue ?? null,
        evaluatorRule: f.evaluatorRule ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      })),
    }))
  return {
    id: 'tpl-1',
    organizationId: 'org-1',
    programId: 'prog-1',
    slug: DEFAULT_WILDFIRE_TEMPLATE.slug,
    name: DEFAULT_WILDFIRE_TEMPLATE.name,
    description: DEFAULT_WILDFIRE_TEMPLATE.description ?? null,
    version: 1,
    isActive: true,
    isBuiltin: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    sections,
  }
}

function response(section: string, slug: string, value: unknown): InspectionResponse {
  // Non-repeatable sections use bare section slug as the instance key;
  // the deck section is repeatable so callers can pass 'deck-0' etc.
  // Tests below all target non-repeatable sections (plus a single deck
  // stamp where the bare 'deck' key is treated as the first instance).
  return {
    id: `${section}::${slug}`,
    inspectionId: 'insp-1',
    sectionInstanceKey: section,
    fieldSlug: slug,
    valueJson: value,
    photosCount: 0,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }
}

describe('evaluateInspection (W2-2)', () => {
  it('returns no issues when every required field is provided + passes its rule', () => {
    const tpl = makeTemplate()
    const responses: InspectionResponse[] = [
      response('zone_0', 'defensible_space_cleared', true),
      response('zone_0', 'mulch_present', false),
      response('zone_1', 'tree_spacing_ft', 12),
      response('zone_1', 'ladder_fuels_present', false),
      response('zone_2', 'tree_canopy_continuous', false),
      response('zone_2', 'dead_fuel_load', 1),
      response('roof', 'roof_material', 'metal'),
      response('roof', 'gutters_clean', true),
      response('vents', 'vent_type', 'ember_resistant'),
      response('eaves', 'eave_type', 'enclosed'),
      response('siding', 'siding_material', 'fiber_cement'),
      response('siding', 'clearance_to_grade_in', 8),
      response('deck', 'deck_material', 'composite'),
      response('deck', 'deck_storage_beneath', false),
    ]
    const issues = evaluateInspection(tpl, responses)
    expect(issues).toEqual([])
  })

  it('flags must_be_true / must_be_one_of / required violations', () => {
    const tpl = makeTemplate()
    const issues = evaluateInspection(tpl, [
      response('zone_0', 'defensible_space_cleared', false), // must_be_true
      response('roof', 'roof_material', 'wood_shake'),       // must_be_one_of
      response('vents', 'vent_type', 'open'),                // must_be_one_of
      // siding_material missing → required violation
    ])
    const slugs = issues.map((i) => i.fieldSlug)
    expect(slugs).toContain('defensible_space_cleared')
    expect(slugs).toContain('roof_material')
    expect(slugs).toContain('vent_type')
    expect(slugs).toContain('siding_material')
  })

  it('flags min/max violations with the right severity', () => {
    const tpl = makeTemplate()
    const issues = evaluateInspection(tpl, [
      response('zone_1', 'tree_spacing_ft', 4),
      response('zone_2', 'dead_fuel_load', 5),
    ])
    const treeIssue = issues.find((i) => i.fieldSlug === 'tree_spacing_ft')
    const fuelIssue = issues.find((i) => i.fieldSlug === 'dead_fuel_load')
    expect(treeIssue?.severity).toBe('error')
    expect(fuelIssue?.severity).toBe('warning')
  })
})

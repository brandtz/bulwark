/**
 * tests/unit/compliance.test.ts — E4-S1 acceptance proof.
 *
 * # Decisions (ADR-0008)
 *   - We test the pure function directly. No DI, no mocks, no Nuxt
 *     environment. Every case is a small literal `ComplianceInput` so a
 *     reader can see the cause-and-effect at a glance.
 *   - One test per failure mode + one all-pass + one all-fail + one
 *     standards-override case. The override case proves E9 wiring will
 *     work end-to-end without a separate suite.
 *
 * # Decision cast down
 *   - Rejected: parameterised "for each material" sweeps. Reads slick,
 *     hides regressions when the function changes signature.
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateCompliance,
  OREGON_DEFAULT_STANDARDS,
} from '~~/shared/utils/compliance'
import type { ComplianceStandards } from '~~/shared/contracts/assessment'

const COMPLIANT_INPUT = {
  roofMaterial: 'metal',
  sidingMaterial: 'fiber_cement',
  eaveType: 'enclosed',
  ventType: 'ember_resistant',
  defensibleSpaceCleared: true,
} as const

describe('evaluateCompliance (E4-S1)', () => {
  it('returns overallCompliant=true when every field passes', () => {
    const result = evaluateCompliance(COMPLIANT_INPUT)
    expect(result.overallCompliant).toBe(true)
    expect(result.nonCompliantFields).toEqual([])
    expect(result.requiredUpgrades).toEqual([])
  })

  it('flags wood_shake roof against default standards', () => {
    const result = evaluateCompliance({ ...COMPLIANT_INPUT, roofMaterial: 'wood_shake' })
    expect(result.overallCompliant).toBe(false)
    expect(result.nonCompliantFields).toEqual(['roofMaterial'])
    expect(result.requiredUpgrades[0]).toMatchObject({
      field: 'roofMaterial',
      currentValue: 'wood_shake',
      standardRef: 'OAR 629-044-1030',
    })
  })

  it('flags vinyl siding', () => {
    const result = evaluateCompliance({ ...COMPLIANT_INPUT, sidingMaterial: 'vinyl' })
    expect(result.nonCompliantFields).toEqual(['sidingMaterial'])
    expect(result.requiredUpgrades[0].standardRef).toBe('OAR 629-044-1040')
  })

  it('flags open eaves', () => {
    const result = evaluateCompliance({ ...COMPLIANT_INPUT, eaveType: 'open' })
    expect(result.nonCompliantFields).toEqual(['eaveType'])
  })

  it('flags unscreened vents', () => {
    const result = evaluateCompliance({ ...COMPLIANT_INPUT, ventType: 'unscreened' })
    expect(result.nonCompliantFields).toEqual(['ventType'])
  })

  it('flags missing defensible space when standard requires it', () => {
    const result = evaluateCompliance({ ...COMPLIANT_INPUT, defensibleSpaceCleared: false })
    expect(result.nonCompliantFields).toEqual(['defensibleSpaceCleared'])
    expect(result.requiredUpgrades[0].currentValue).toBe('not cleared')
  })

  it('returns one upgrade per failed field when multiple fail', () => {
    const result = evaluateCompliance({
      roofMaterial: 'wood_shake',
      sidingMaterial: 'vinyl',
      eaveType: 'open',
      ventType: 'unscreened',
      defensibleSpaceCleared: false,
    })
    expect(result.overallCompliant).toBe(false)
    expect(result.nonCompliantFields).toHaveLength(5)
    expect(result.requiredUpgrades).toHaveLength(5)
  })

  it('respects per-tenant standards override (E9 wiring)', () => {
    // A tenant who has decided wood_shake is acceptable. Same input that
    // failed against defaults should now pass.
    const lenient: ComplianceStandards = {
      ...OREGON_DEFAULT_STANDARDS,
      compliantRoofMaterials: [...OREGON_DEFAULT_STANDARDS.compliantRoofMaterials, 'wood_shake'],
    }
    const result = evaluateCompliance(
      { ...COMPLIANT_INPUT, roofMaterial: 'wood_shake' },
      lenient,
    )
    expect(result.overallCompliant).toBe(true)
  })

  it('skips defensible-space check when standard does not require it', () => {
    const optional: ComplianceStandards = {
      ...OREGON_DEFAULT_STANDARDS,
      requireDefensibleSpace: false,
    }
    const result = evaluateCompliance(
      { ...COMPLIANT_INPUT, defensibleSpaceCleared: false },
      optional,
    )
    expect(result.overallCompliant).toBe(true)
  })
})

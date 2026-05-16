/**
 * tests/unit/mfa-setup.test.ts — pure step-derivation for the MFA
 * setup page (W4-1 / EH-I).
 */
import { describe, it, expect } from 'vitest'
import { deriveInitialStep } from '../../app/composables/mfa-setup-helpers'

describe('deriveInitialStep', () => {
  it('returns idle when status is null', () => {
    expect(deriveInitialStep(null)).toBe('idle')
  })
  it('returns enrolled when MFA is enabled', () => {
    expect(
      deriveInitialStep({ enabled: true, kind: 'totp', backupCodesRemaining: 7 }),
    ).toBe('enrolled')
  })
  it('returns idle when MFA is not enabled', () => {
    expect(deriveInitialStep({ enabled: false, backupCodesRemaining: 0 })).toBe('idle')
  })
})

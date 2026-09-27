/** WP-L07 S2 — idle timeout and MFA-gate decisions (server/utils/security-enforcement.ts). */
import { describe, expect, it } from 'vitest'
import { idleDecision, mfaGateBlocks, MFA_SETUP_ALLOWED } from '../../server/utils/security-enforcement'

const now = 1_800_000_000_000
const min = 60_000

describe('idleDecision', () => {
  it('expires a session idle for longer than the policy allows, even on passive calls', () => {
    expect(idleDecision(now - 16 * min, 15, now, false)).toBe('expired')
    expect(idleDecision(now - 16 * min, 15, now, true)).toBe('expired')
  })

  it('never expires without an idle policy', () => {
    expect(idleDecision(now - 1000 * min, null, now, false)).toBe('refresh')
  })

  it('refreshes activity at most once a minute and never on passive polling', () => {
    expect(idleDecision(undefined, 15, now, false)).toBe('refresh')
    expect(idleDecision(now - 2 * min, 15, now, false)).toBe('refresh')
    expect(idleDecision(now - 10_000, 15, now, false)).toBe('ok')
    expect(idleDecision(now - 2 * min, 15, now, true)).toBe('ok')
  })
})

describe('mfaGateBlocks', () => {
  it('blocks normal calls for unenrolled members only when MFA is required', () => {
    expect(mfaGateBlocks({ mfaMode: 'required' }, false, 'property.list')).toBe(true)
    expect(mfaGateBlocks({ mfaMode: 'required' }, true, 'property.list')).toBe(false)
    expect(mfaGateBlocks({ mfaMode: 'optional' }, false, 'property.list')).toBe(false)
    expect(mfaGateBlocks({ mfaMode: 'disabled' }, false, 'property.list')).toBe(false)
  })

  it('always leaves the enrolment path reachable', () => {
    for (const key of ['mfa.setupTotp', 'mfa.confirmTotp', 'auth.logout', 'securityPolicy.getMine', 'securityPolicy.update']) {
      expect(MFA_SETUP_ALLOWED.has(key)).toBe(true)
      expect(mfaGateBlocks({ mfaMode: 'required' }, false, key)).toBe(false)
    }
  })
})

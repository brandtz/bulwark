/**
 * tests/unit/login-flow.test.ts — pure state-machine reducer behind
 * the login page (W4-1 / EH-I).
 */
import { describe, it, expect } from 'vitest'
import {
  stepFromLoginResult,
  stepFromLoginError,
  formatRetryAfter,
} from '../../app/composables/login-flow-helpers'
import type { AuthLoginResult } from '../../shared/contracts/auth'

describe('stepFromLoginResult', () => {
  it('maps an mfa_required result onto an mfaRequired step', () => {
    const r: AuthLoginResult = {
      kind: 'mfa_required',
      mfaToken: 'tok',
      email: 'a@b.com',
    }
    const step = stepFromLoginResult(r)
    expect(step.kind).toBe('mfaRequired')
    if (step.kind === 'mfaRequired') {
      expect(step.mfaToken).toBe('tok')
      expect(step.email).toBe('a@b.com')
    }
  })

  it('maps a session result onto a success step', () => {
    const r = { kind: 'session' } as unknown as AuthLoginResult
    expect(stepFromLoginResult(r).kind).toBe('success')
  })
})

describe('stepFromLoginError', () => {
  it('maps account_locked errors onto a locked step with retry seconds', () => {
    const err = new Error('account_locked') as Error & { retryAfterSeconds?: number }
    err.retryAfterSeconds = 120
    const step = stepFromLoginError(err)
    expect(step?.kind).toBe('locked')
    if (step?.kind === 'locked') {
      expect(step.retryAfterSeconds).toBe(120)
    }
  })

  it('returns null for unrelated errors', () => {
    expect(stepFromLoginError(new Error('invalid_credentials'))).toBeNull()
  })
})

describe('formatRetryAfter', () => {
  it('formats < 60s as seconds', () => {
    expect(formatRetryAfter(45)).toBe('45s')
  })
  it('formats minutes with remainder', () => {
    expect(formatRetryAfter(125)).toBe('2m 5s')
  })
  it('formats exact minutes without trailing seconds', () => {
    expect(formatRetryAfter(180)).toBe('3m')
  })
})

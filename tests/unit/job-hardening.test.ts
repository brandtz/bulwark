/**
 * tests/unit/job-hardening.test.ts — L04/L05 pure-logic coverage.
 *
 * Covers: policy-registry exhaustiveness (L04-S1/S5), the worker prod
 * env-guard (L04-S2), and the consecutive-failure alert tracker (L05-S4).
 * All pure — no DB, no pg-boss.
 */
import { describe, expect, it } from 'vitest'
import { JobKindSchema } from '../../shared/contracts/job'
import { ALL_JOB_KINDS, JOB_POLICIES } from '../../server/jobs/policy'
import { HANDLERS } from '../../server/jobs/handlers'
import { assertProdWorkerEnv } from '../../server/jobs/env-guard'
import { ConsecutiveFailureTracker } from '../../server/jobs/failure-alert'

describe('job policy registry (L04-S1/S5)', () => {
  it('covers every JobKind in the contract, exactly', () => {
    expect([...ALL_JOB_KINDS].sort()).toEqual([...JobKindSchema.options].sort())
  })

  it('every kind has a registered handler', () => {
    for (const kind of JobKindSchema.options) {
      expect(HANDLERS[kind], `handler for ${kind}`).toBeTypeOf('function')
    }
  })

  it('every policy is sane: retries with bounded attempts', () => {
    for (const kind of ALL_JOB_KINDS) {
      const p = JOB_POLICIES[kind]
      expect(p.retryLimit).toBeGreaterThanOrEqual(1)
      expect(p.retryLimit).toBeLessThanOrEqual(10)
      expect(p.retryDelay).toBeGreaterThanOrEqual(1)
      expect(p.retryBackoff).toBe(true)
      expect(p.expireInSeconds).toBeGreaterThan(0)
    }
  })
})

describe('assertProdWorkerEnv (L04-S2)', () => {
  it('throws in production with the PDF stub active', () => {
    expect(() =>
      assertProdWorkerEnv({ NODE_ENV: 'production', BULWARK_PDF_STUB: '1' }),
    ).toThrow(/BULWARK_PDF_STUB/)
  })

  it('throws in production with fs storage or mock backend', () => {
    expect(() =>
      assertProdWorkerEnv({ NODE_ENV: 'production', BULWARK_STORAGE_DRIVER: 'fs' }),
    ).toThrow(/BULWARK_STORAGE_DRIVER/)
    expect(() =>
      assertProdWorkerEnv({ NODE_ENV: 'production', BULWARK_BACKEND: 'mock' }),
    ).toThrow(/BULWARK_BACKEND/)
  })

  it('lists every violation in one message', () => {
    expect(() =>
      assertProdWorkerEnv({
        NODE_ENV: 'production',
        BULWARK_PDF_STUB: '1',
        BULWARK_STORAGE_DRIVER: 'fs',
      }),
    ).toThrow(/BULWARK_PDF_STUB.*BULWARK_STORAGE_DRIVER/s)
  })

  it('passes clean production and any dev/test combination', () => {
    expect(() => assertProdWorkerEnv({ NODE_ENV: 'production' })).not.toThrow()
    expect(() =>
      assertProdWorkerEnv({ NODE_ENV: 'development', BULWARK_PDF_STUB: '1' }),
    ).not.toThrow()
    expect(() =>
      assertProdWorkerEnv({ NODE_ENV: 'test', BULWARK_STORAGE_DRIVER: 'fs' }),
    ).not.toThrow()
  })
})

describe('ConsecutiveFailureTracker (L05-S4)', () => {
  it('alerts exactly once when the streak hits the threshold', () => {
    const t = new ConsecutiveFailureTracker(3)
    expect(t.recordFailure('compliance_doc').shouldAlert).toBe(false)
    expect(t.recordFailure('compliance_doc').shouldAlert).toBe(false)
    const third = t.recordFailure('compliance_doc')
    expect(third.shouldAlert).toBe(true)
    expect(third.streak).toBe(3)
    // Fourth consecutive failure does NOT re-alert (one signal per incident).
    expect(t.recordFailure('compliance_doc').shouldAlert).toBe(false)
  })

  it('a success resets the streak and re-arms the alert', () => {
    const t = new ConsecutiveFailureTracker(2)
    t.recordFailure('account_purge')
    expect(t.recordFailure('account_purge').shouldAlert).toBe(true)
    expect(t.recordSuccess('account_purge').streak).toBe(0)
    t.recordFailure('account_purge')
    expect(t.recordFailure('account_purge').shouldAlert).toBe(true)
  })

  it('streaks are tracked per kind independently', () => {
    const t = new ConsecutiveFailureTracker(2)
    t.recordFailure('compliance_doc')
    t.recordFailure('coi_expiry_scan')
    expect(t.recordFailure('compliance_doc').shouldAlert).toBe(true)
    expect(t.recordFailure('coi_expiry_scan').shouldAlert).toBe(true)
  })
})

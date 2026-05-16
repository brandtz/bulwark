/**
 * tests/unit/rate-limit.test.ts — token-bucket evaluator + metrics emission
 * (W5-1 / EH-R / ADR-0035).
 *
 * Tests target `evaluateRateLimit`, the pure helper inside
 * `server/middleware/01.rate-limit.ts`. The h3 middleware wrapper is
 * a thin adapter over this function — covering the evaluator covers
 * the policy.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  evaluateRateLimit,
  __resetRateLimitForTests,
  RATE_LIMIT_RULES,
} from '~~/server/utils/rate-limit'
import {
  COUNTERS,
  readCounter,
  __resetCountersForTests,
} from '~~/server/utils/metrics'

const originalEnv = { ...process.env }

beforeEach(() => {
  __resetRateLimitForTests()
  __resetCountersForTests()
  delete process.env.BULWARK_RATE_LIMIT_DISABLED
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('evaluateRateLimit — bypass', () => {
  it('always allows when BULWARK_RATE_LIMIT_DISABLED=1', () => {
    process.env.BULWARK_RATE_LIMIT_DISABLED = '1'
    for (let i = 0; i < 1000; i++) {
      const r = evaluateRateLimit({ ip: '1.1.1.1', path: '/api/services/auth/login', method: 'POST' })
      expect(r.allowed).toBe(true)
    }
  })
})

describe('evaluateRateLimit — global default (60/min)', () => {
  it('allows 60 then blocks the 61st request from the same IP', () => {
    const ip = '10.0.0.1'
    const t0 = 1_000_000
    for (let i = 0; i < 60; i++) {
      const r = evaluateRateLimit({ ip, path: '/api/health', method: 'GET', now: t0 })
      expect(r.allowed).toBe(true)
    }
    const blocked = evaluateRateLimit({ ip, path: '/api/health', method: 'GET', now: t0 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  it('rolls the window after windowMs elapses', () => {
    const ip = '10.0.0.2'
    for (let i = 0; i < 60; i++) {
      evaluateRateLimit({ ip, path: '/api/health', method: 'GET', now: 1_000_000 })
    }
    const after = evaluateRateLimit({ ip, path: '/api/health', method: 'GET', now: 1_000_000 + 60_001 })
    expect(after.allowed).toBe(true)
  })
})

describe('evaluateRateLimit — per-route IP override', () => {
  it('caps /api/services/auth/login at 10/min per IP', () => {
    const ip = '203.0.113.7'
    for (let i = 0; i < 10; i++) {
      const r = evaluateRateLimit({ ip, path: '/api/services/auth/login', method: 'POST', email: `a${i}@x.com`, now: 1_000_000 })
      expect(r.allowed).toBe(true)
    }
    const blocked = evaluateRateLimit({ ip, path: '/api/services/auth/login', method: 'POST', email: 'a11@x.com', now: 1_000_000 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.dimension).toBe('ip')
    expect(blocked.rule?.key).toBe('auth.login')
  })

  it('caps acceptInvite at 5/min per IP', () => {
    const ip = '203.0.113.8'
    for (let i = 0; i < 5; i++) {
      const r = evaluateRateLimit({ ip, path: '/api/services/auth/acceptInvite', method: 'POST', now: 2_000_000 })
      expect(r.allowed).toBe(true)
    }
    const blocked = evaluateRateLimit({ ip, path: '/api/services/auth/acceptInvite', method: 'POST', now: 2_000_000 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.rule?.key).toBe('auth.accept-invite')
  })
})

describe('evaluateRateLimit — per-email throttle', () => {
  it('blocks the 6th login for the same email even from rotating IPs', () => {
    const email = 'victim@example.com'
    const t = 3_000_000
    for (let i = 0; i < 5; i++) {
      const r = evaluateRateLimit({ ip: `198.51.100.${i + 1}`, path: '/api/services/auth/login', method: 'POST', email, now: t })
      expect(r.allowed).toBe(true)
    }
    const blocked = evaluateRateLimit({ ip: '198.51.100.99', path: '/api/services/auth/login', method: 'POST', email, now: t })
    expect(blocked.allowed).toBe(false)
    expect(blocked.dimension).toBe('email')
  })

  it('lowercases the email key so case variants share a bucket', () => {
    const t = 4_000_000
    for (let i = 0; i < 5; i++) {
      evaluateRateLimit({ ip: `192.0.2.${i + 1}`, path: '/api/services/auth/login', method: 'POST', email: 'Mixed@Case.com', now: t })
    }
    const blocked = evaluateRateLimit({ ip: '192.0.2.99', path: '/api/services/auth/login', method: 'POST', email: 'mixed@case.com', now: t })
    expect(blocked.allowed).toBe(false)
    expect(blocked.dimension).toBe('email')
  })
})

describe('evaluateRateLimit — retryAfter', () => {
  it('returns whole-second retryAfter close to windowMs', () => {
    const ip = '198.51.100.50'
    const t = 5_000_000
    for (let i = 0; i < 10; i++) {
      evaluateRateLimit({ ip, path: '/api/services/auth/login', method: 'POST', now: t })
    }
    const blocked = evaluateRateLimit({ ip, path: '/api/services/auth/login', method: 'POST', now: t + 1000 })
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(58)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })
})

describe('rule registry sanity', () => {
  it('exposes login + accept-invite + forgot-password + catch-all rules', () => {
    const keys = RATE_LIMIT_RULES.map((r) => r.key)
    expect(keys).toContain('auth.login')
    expect(keys).toContain('auth.accept-invite')
    expect(keys).toContain('auth.forgot-password')
    expect(keys).toContain('auth.catch-all')
  })
})

describe('metrics counter wiring', () => {
  // The middleware wrapper increments rate_limit_blocks_total on every
  // block. We assert the counter exists in COUNTERS and starts at zero
  // so the wiring contract is captured; the live increment is exercised
  // by integration tests that drive a real h3 event.
  it('seeds rate_limit_blocks_total at zero', () => {
    expect(COUNTERS.rateLimitBlocksTotal).toBe('rate_limit_blocks_total')
    expect(readCounter(COUNTERS.rateLimitBlocksTotal)).toBe(0)
  })
})

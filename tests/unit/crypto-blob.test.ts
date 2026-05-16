/**
 * tests/unit/crypto-blob.test.ts — W5-2 / ADR-0036
 *
 * Round-trip + tamper coverage for the JSON-blob convenience wrappers
 * used by `provider_configs.config_encrypted`. The base
 * `encryptSecret` / `decryptSecret` envelope semantics are covered by
 * MFA integration tests; this file pins the JSON helper so a future
 * refactor of the schema-sealing path stays correct.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { encryptJsonBlob, decryptJsonBlob, encryptSecret } from '~~/server/utils/crypto'

const ORIGINAL_KEY = process.env.BULWARK_ENCRYPTION_KEY
const ORIGINAL_JWT = process.env.JWT_SECRET

beforeAll(() => {
  process.env.BULWARK_ENCRYPTION_KEY = 'unit-test-encryption-key-1234567890abcdef'
})
afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.BULWARK_ENCRYPTION_KEY
  else process.env.BULWARK_ENCRYPTION_KEY = ORIGINAL_KEY
  if (ORIGINAL_JWT === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = ORIGINAL_JWT
})

describe('crypto JSON blob helpers', () => {
  it('round-trips a provider-config payload', () => {
    const payload = {
      apiKey: 're_test_1234567890',
      fromAddress: 'ops@example.com',
    }
    const sealed = encryptJsonBlob(payload)
    expect(typeof sealed).toBe('string')
    expect(sealed).not.toContain('re_test_1234567890')
    const out = decryptJsonBlob<typeof payload>(sealed)
    expect(out).toEqual(payload)
  })

  it('produces distinct ciphertexts for identical inputs (random IV)', () => {
    const a = encryptJsonBlob({ apiKey: 'x' })
    const b = encryptJsonBlob({ apiKey: 'x' })
    expect(a).not.toBe(b)
  })

  it('returns {} for null / empty / undefined envelopes', () => {
    expect(decryptJsonBlob(null)).toEqual({})
    expect(decryptJsonBlob(undefined)).toEqual({})
    expect(decryptJsonBlob('')).toEqual({})
  })

  it('throws on a tampered envelope', () => {
    const sealed = encryptSecret('hello')
    const tampered = sealed.slice(0, -2) + 'AA'
    expect(() => decryptJsonBlob(tampered)).toThrow()
  })
})

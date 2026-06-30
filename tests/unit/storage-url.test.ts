/**
 * tests/unit/storage-url.test.ts — L01-S3 production placeholder-URL guard.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { assertStorableUrlOrKey } from '~~/shared/utils/storage-url'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV
})

describe('assertStorableUrlOrKey', () => {
  it('is a no-op in dev/test even for data: URLs', () => {
    process.env.NODE_ENV = 'test'
    expect(() => assertStorableUrlOrKey('data:image/png;base64,AAAA')).not.toThrow()
    expect(() => assertStorableUrlOrKey('local://photos/x.jpg')).not.toThrow()
  })

  it('throws in production for data: / local:// / blob: (case + whitespace robust)', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertStorableUrlOrKey('data:image/png;base64,AAAA')).toThrow()
    expect(() => assertStorableUrlOrKey('local://photos/x.jpg')).toThrow()
    expect(() => assertStorableUrlOrKey('DATA:image/png;base64,AAAA')).toThrow()
    expect(() => assertStorableUrlOrKey('  data:image/png;base64,AAAA')).toThrow()
    expect(() => assertStorableUrlOrKey('blob:https://x/abc')).toThrow()
  })

  it('allows storage keys and http(s) URLs in production', () => {
    process.env.NODE_ENV = 'production'
    expect(() =>
      assertStorableUrlOrKey('11111111-1111-1111-1111-111111111111/property_photo/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333.jpg'),
    ).not.toThrow()
    expect(() => assertStorableUrlOrKey('https://cdn.example.com/x.png')).not.toThrow()
  })

  it('is a no-op for null / empty values', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertStorableUrlOrKey(null)).not.toThrow()
    expect(() => assertStorableUrlOrKey(undefined)).not.toThrow()
    expect(() => assertStorableUrlOrKey('')).not.toThrow()
  })
})

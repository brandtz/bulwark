/**
 * tests/unit/cors.test.ts — CORS allowlist + preflight behaviour
 * (W5-1 / EH-R / ADR-0035).
 */
import { describe, it, expect } from 'vitest'
import { decideCors, parseAllowlist } from '~~/server/utils/cors'

describe('parseAllowlist', () => {
  it('returns an empty list when the env is unset', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist('')).toEqual([])
  })
  it('trims and drops empty entries', () => {
    expect(parseAllowlist('https://a.example.com, https://b.example.com,')).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ])
  })
})

describe('decideCors — same-origin default', () => {
  it('returns empty headers when allowlist is empty', () => {
    const d = decideCors({ origin: 'https://evil.example.com', method: 'GET', allowlist: [] })
    expect(d.headers).toEqual({})
    expect(d.preflight).toBe(false)
  })

  it('returns empty headers when origin is absent', () => {
    const d = decideCors({
      origin: null,
      method: 'GET',
      allowlist: ['https://a.example.com'],
    })
    expect(d.headers).toEqual({})
  })
})

describe('decideCors — allowlist echo', () => {
  it('echoes a matching origin and sets credentials', () => {
    const d = decideCors({
      origin: 'https://a.example.com',
      method: 'GET',
      allowlist: ['https://a.example.com', 'https://b.example.com'],
    })
    expect(d.headers['Access-Control-Allow-Origin']).toBe('https://a.example.com')
    expect(d.headers['Access-Control-Allow-Credentials']).toBe('true')
    expect(d.headers['Access-Control-Allow-Methods']).toContain('POST')
    expect(d.headers['Access-Control-Allow-Headers']).toContain('Authorization')
    expect(d.headers.Vary).toBe('Origin')
  })

  it('does NOT echo an origin not in the allowlist', () => {
    const d = decideCors({
      origin: 'https://evil.example.com',
      method: 'GET',
      allowlist: ['https://a.example.com'],
    })
    expect(d.headers).toEqual({})
  })
})

describe('decideCors — OPTIONS preflight', () => {
  it('flags preflight true when method=OPTIONS and origin allowed', () => {
    const d = decideCors({
      origin: 'https://a.example.com',
      method: 'OPTIONS',
      allowlist: ['https://a.example.com'],
    })
    expect(d.preflight).toBe(true)
    expect(d.headers['Access-Control-Allow-Origin']).toBe('https://a.example.com')
  })

  it('does NOT flag preflight on OPTIONS when origin is unknown', () => {
    const d = decideCors({
      origin: 'https://evil.example.com',
      method: 'OPTIONS',
      allowlist: ['https://a.example.com'],
    })
    expect(d.preflight).toBe(false)
  })
})

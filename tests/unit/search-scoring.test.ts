/**
 * tests/unit/search-scoring.test.ts — pure scoring helper checks
 * (W3-5 / EH-P / ADR-0033).
 */
import { describe, it, expect } from 'vitest'
import { scoreSearchHit } from '~~/shared/contracts/search'

describe('scoreSearchHit', () => {
  it('returns 0 when the query does not match either field', () => {
    expect(scoreSearchHit('xyz', 'Main Street', 'Brooklyn, NY · active')).toBe(0)
  })

  it('rewards a title-prefix match over a substring match', () => {
    const prefix = scoreSearchHit('Main', 'Main Street', 'Brooklyn, NY')
    const middle = scoreSearchHit('Stre', 'Main Street', 'Brooklyn, NY')
    expect(prefix).toBeGreaterThan(middle)
  })

  it('rewards a title hit higher than a subtitle-only hit', () => {
    const titleHit = scoreSearchHit('Brook', 'Brooklyn Heights', 'Brooklyn, NY')
    const subtitleOnly = scoreSearchHit('Brook', 'Main Street', 'Brooklyn, NY')
    expect(titleHit).toBeGreaterThan(subtitleOnly)
  })

  it('returns a value in the [0, 1] range', () => {
    const s = scoreSearchHit('Main', 'Main Street', 'Brooklyn, NY · active')
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(1)
  })

  it('is stable for identical inputs (no randomness)', () => {
    const a = scoreSearchHit('abc', 'abcdef', 'xyz')
    const b = scoreSearchHit('abc', 'abcdef', 'xyz')
    expect(a).toBe(b)
  })

  it('is case-insensitive', () => {
    expect(scoreSearchHit('MAIN', 'main street', 'brooklyn')).toBeGreaterThan(0)
  })

  it('returns 0 for an empty query', () => {
    expect(scoreSearchHit('', 'Main Street', 'Brooklyn')).toBe(0)
  })
})

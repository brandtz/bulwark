/**
 * tests/unit/search-scoring.test.ts — pure scoring helper checks
 * (W3-5 / EH-P / ADR-0033).
 */
import { describe, it, expect } from 'vitest'
import { scoreSearchHit, type SearchResult } from '~~/shared/contracts/search'
import { groupResults } from '~~/app/composables/useGlobalSearch'

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

describe('groupResults (WP-S2 / ED-012)', () => {
  it('groups search hits by entityType while preserving rank order', () => {
    const rows: SearchResult[] = [
      { entityType: 'property', id: '1', title: '1842 Rimrock Rd', subtitle: 'Bend, OR', url: '/admin/properties/1', score: 0.9, organizationId: 'org-1' },
      { entityType: 'quote', id: '2', title: 'Q-1042', subtitle: 'Sent', url: '/admin/quotes/2', score: 0.85, organizationId: 'org-1' },
      { entityType: 'property', id: '3', title: '900 Skyline Dr', subtitle: 'Bend, OR', url: '/admin/properties/3', score: 0.7, organizationId: 'org-1' },
    ]
    const groups = groupResults(rows)
    expect(groups.map((g) => g.entityType)).toEqual(['property', 'quote'])
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(['1', '3'])
    expect(groups[1]!.rows.map((r) => r.id)).toEqual(['2'])
  })
})

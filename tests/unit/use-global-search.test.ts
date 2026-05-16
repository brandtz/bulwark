/**
 * tests/unit/use-global-search.test.ts — pure helpers behind the
 * Cmd-K palette (W4-1 / EH-J).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createDebouncer,
  groupResults,
} from '../../app/composables/useGlobalSearch'

afterEach(() => {
  vi.useRealTimers()
})

describe('createDebouncer', () => {
  it('fires once after the delay when scheduled multiple times', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = createDebouncer(200)
    d.schedule(fn)
    d.schedule(fn)
    d.schedule(fn)
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not fire when cancelled before the delay elapses', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = createDebouncer(50)
    d.schedule(fn)
    d.cancel()
    vi.advanceTimersByTime(100)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('groupResults', () => {
  it('preserves the original order of first occurrence per entityType', () => {
    const rows = [
      { id: '1', entityType: 'property', title: 'A', subtitle: '', url: '/p/1', score: 1, organizationId: 'o' },
      { id: '2', entityType: 'quote', title: 'B', subtitle: '', url: '/q/2', score: 1, organizationId: 'o' },
      { id: '3', entityType: 'property', title: 'C', subtitle: '', url: '/p/3', score: 1, organizationId: 'o' },
      { id: '4', entityType: 'invoice', title: 'D', subtitle: '', url: '/i/4', score: 1, organizationId: 'o' },
    ] as const
    const grouped = groupResults(rows as unknown as Parameters<typeof groupResults>[0])
    expect(grouped.map((g) => g.entityType)).toEqual(['property', 'quote', 'invoice'])
    const prop = grouped.find((g) => g.entityType === 'property')!
    expect(prop.rows.map((r) => r.id)).toEqual(['1', '3'])
  })

  it('returns an empty array for empty input', () => {
    expect(groupResults([])).toEqual([])
  })
})

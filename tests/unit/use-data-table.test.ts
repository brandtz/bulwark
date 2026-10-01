/**
 * tests/unit/use-data-table.test.ts — WP-A3 DataTable sort + selection logic.
 */
import { describe, expect, it } from 'vitest'
import {
  compareCells, emptySelection, headerState, nextSort, selectAllMatching, selectedCount, sortRows, toggleKey, togglePage,
} from '~~/app/composables/useDataTable'

const rows = [
  { id: 'a', name: 'Unit 10', total: 300, due: null },
  { id: 'b', name: 'unit 2', total: 100, due: '2026-10-02' },
  { id: 'c', name: 'Unit 2', total: 300, due: '' },
  { id: 'd', name: 'Annex', total: null, due: '2026-09-30' },
]

describe('sortRows', () => {
  it('is stable: equal keys keep their input order in both directions', () => {
    expect(sortRows(rows, { key: 'total', dir: 'asc' }).map((r) => r.id)).toEqual(['b', 'a', 'c', 'd'])
    expect(sortRows(rows, { key: 'total', dir: 'desc' }).map((r) => r.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('keeps empty values last whichever way the column sorts', () => {
    expect(sortRows(rows, { key: 'due', dir: 'asc' }).map((r) => r.id)).toEqual(['d', 'b', 'a', 'c'])
    expect(sortRows(rows, { key: 'due', dir: 'desc' }).map((r) => r.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('collates text numerically and case-insensitively', () => {
    expect(sortRows(rows, { key: 'name', dir: 'asc' }).map((r) => r.name)).toEqual(['Annex', 'unit 2', 'Unit 2', 'Unit 10'])
  })

  it('groups mixed types (numbers before text) instead of comparing them', () => {
    expect([3, 'b', 1, 'a'].sort(compareCells)).toEqual([1, 3, 'a', 'b'])
  })

  it('without a sort returns a copy in input order', () => {
    const out = sortRows(rows, null)
    expect(out).toEqual(rows)
    expect(out).not.toBe(rows)
  })

  it('header activation cycles asc → desc → none, and resets on another column', () => {
    expect(nextSort(null, 'total')).toEqual({ key: 'total', dir: 'asc' })
    expect(nextSort({ key: 'total', dir: 'asc' }, 'total')).toEqual({ key: 'total', dir: 'desc' })
    expect(nextSort({ key: 'total', dir: 'desc' }, 'total')).toBeNull()
    expect(nextSort({ key: 'total', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' })
  })
})

describe('selection', () => {
  const loaded = Array.from({ length: 50 }, (_, i) => `r${i}`)

  it('the header checkbox selects only the loaded rows, never every match', () => {
    const s = togglePage(emptySelection(), loaded)
    expect(s.keys.size).toBe(50)
    expect(s.allMatching).toBe(false)
    expect(selectedCount(s, 1000)).toBe(50)
    expect(headerState(s, loaded)).toBe('all')
  })

  it('"Select all N" is a separate, explicit step', () => {
    const s = selectAllMatching(togglePage(emptySelection(), loaded))
    expect(selectedCount(s, 1000)).toBe(1000)
    // Touching one row leaves the all-matching mode.
    const t = toggleKey(s, 'r3')
    expect(t.allMatching).toBe(false)
    expect(selectedCount(t, 1000)).toBe(49)
  })

  it('reports none / some / all and clears when everything loaded was selected', () => {
    expect(headerState(emptySelection(), loaded)).toBe('none')
    expect(headerState(toggleKey(emptySelection(), 'r1'), loaded)).toBe('some')
    const all = togglePage(emptySelection(), loaded)
    expect(togglePage(all, loaded).keys.size).toBe(0)
    expect(headerState(emptySelection(), [])).toBe('none')
  })
})

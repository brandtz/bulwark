/**
 * tests/unit/use-filter-bar.test.ts — WP-A3 FilterBar URL round-trip.
 */
import { describe, expect, it } from 'vitest'
import { activeCount, fromQuery, mergeQuery, toQuery, type FilterDef } from '~~/app/composables/useFilterBar'

const FILTERS: FilterDef[] = [
  { key: 'status', label: 'Status', type: 'multiselect', options: [{ value: 'lead', label: 'Lead' }, { value: 'quoted', label: 'Quoted' }] },
  { key: 'owner', label: 'Owner', type: 'select', options: [{ value: 'me', label: 'Me' }, { value: 'anyone', label: 'Anyone' }] },
  { key: 'from', label: 'From', type: 'date' },
  { key: 'q', label: 'Search', type: 'text' },
]

describe('FilterBar URL state', () => {
  it('round-trips arrays, single values and dates', () => {
    const model = { status: ['lead', 'quoted'], owner: ['me'], from: ['2026-10-01'], q: ['rimrock'] }
    const query = toQuery(model, FILTERS)
    expect(query).toEqual({ status: ['lead', 'quoted'], owner: 'me', from: '2026-10-01', q: 'rimrock' })
    expect(fromQuery(query as Record<string, unknown>, FILTERS)).toEqual(model)
  })

  it('ignores malformed and unknown values instead of failing', () => {
    const model = fromQuery({
      status: ['lead', 'bogus', 'lead'], // unknown option and a duplicate
      owner: ['me', 'anyone'], // a single select keeps one
      from: '2026-13-45', // not a date
      junk: 'x', // not a filter
      q: ['', 'ok'],
    }, FILTERS)
    expect(model).toEqual({ status: ['lead'], owner: ['me'], q: ['ok'] })
  })

  it('clearing removes the filter params, keeps the rest and restarts paging', () => {
    const merged = mergeQuery({ status: ['lead'], tab: 'list', page: '4', sort: 'created' }, {}, FILTERS)
    expect(merged).toEqual({ tab: 'list', sort: 'created' })
    expect(mergeQuery({ tab: 'list' }, { status: ['quoted'] }, FILTERS)).toEqual({ tab: 'list', status: 'quoted' })
  })

  it('counts active filter values', () => {
    expect(activeCount({ status: ['lead', 'quoted'], owner: ['me'] })).toBe(3)
    expect(activeCount({})).toBe(0)
  })
})

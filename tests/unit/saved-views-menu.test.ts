/**
 * tests/unit/saved-views-menu.test.ts — pure partition helper used by
 * the saved-views dropdown (W4-1 / EH-K).
 */
import { describe, it, expect } from 'vitest'
import { partitionSavedViews } from '../../app/components/views/saved-views-helpers'

const ME = '00000000-0000-0000-0000-00000000aaaa'
const OTHER = '00000000-0000-0000-0000-00000000bbbb'

function row(over: Partial<{ id: string; userId: string | null; name: string }> = {}) {
  return {
    id: over.id ?? 'v1',
    organizationId: 'o',
    entityType: 'property' as const,
    userId: over.userId === undefined ? ME : over.userId,
    name: over.name ?? 'View',
    filters: {},
    sortBy: null,
    sortDir: null,
    isDefault: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
  }
}

describe('partitionSavedViews', () => {
  it('puts the current user\'s rows in mine, shared (userId=null) in shared', () => {
    const rows = [
      row({ id: 'a', userId: ME, name: 'Mine A' }),
      row({ id: 'b', userId: null, name: 'Shared B' }),
      row({ id: 'c', userId: ME, name: 'Mine C' }),
    ]
    const out = partitionSavedViews(rows as never, ME)
    expect(out.mine.map((v) => v.id)).toEqual(['a', 'c'])
    expect(out.shared.map((v) => v.id)).toEqual(['b'])
  })

  it('drops rows owned by a different user (defensive)', () => {
    const rows = [
      row({ id: 'a', userId: OTHER, name: 'Theirs' }),
      row({ id: 'b', userId: null, name: 'Shared' }),
    ]
    const out = partitionSavedViews(rows as never, ME)
    expect(out.mine).toEqual([])
    expect(out.shared.map((v) => v.id)).toEqual(['b'])
  })

  it('returns empty arrays when input is empty', () => {
    const out = partitionSavedViews([] as never, ME)
    expect(out.mine).toEqual([])
    expect(out.shared).toEqual([])
  })
})

/**
 * tests/unit/pagination.test.ts — WP-L06 S3 offset cap + keyset cursor (pure).
 */
import { describe, expect, it } from 'vitest'
import { assertPageWindow, compareNewestFirst, MAX_OFFSET_PAGE, nextCursorFor, pageRows } from '~~/shared/utils/pagination'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
// 25 rows; timestamps collide in pairs to exercise the id tie-break.
const rows = Array.from({ length: 25 }, (_, i) => ({
  id: id(i + 1),
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(i / 2))).toISOString(),
})).sort(compareNewestFirst)

describe('keyset pagination helpers (WP-L06 S3)', () => {
  it('walks the full set by cursor with no duplicate or skipped rows', () => {
    const seen: string[] = []
    let cursor: { afterCreatedAt: string, afterId: string } | null = null
    let pages = 0
    do {
      const page: ReturnType<typeof pageRows<(typeof rows)[number]>> = pageRows(rows, { page: 1, pageSize: 7, ...(cursor ?? {}) })
      seen.push(...page.rows.map((r) => r.id))
      cursor = page.nextCursor
      pages++
    } while (cursor && pages < 10)
    expect(seen).toEqual(rows.map((r) => r.id))
    expect(new Set(seen).size).toBe(25)
    expect(pages).toBe(4)
  })

  it('returns a null cursor on the last (short) page and on an exact final page', () => {
    expect(nextCursorFor(rows.slice(0, 3), 7)).toBeNull()
    expect(nextCursorFor([], 7)).toBeNull()
    const exact = pageRows(rows, { page: 1, pageSize: 25 })
    expect(exact.nextCursor).not.toBeNull()
    expect(pageRows(rows, { page: 1, pageSize: 25, ...exact.nextCursor! }).rows).toEqual([])
  })

  it('caps offset pages and rejects a malformed cursor timestamp (HTTP 400 prefix)', () => {
    expect(() => assertPageWindow({ page: MAX_OFFSET_PAGE, pageSize: 10 })).not.toThrow()
    expect(() => assertPageWindow({ page: MAX_OFFSET_PAGE + 1, pageSize: 10 })).toThrow(/^Invalid pagination/)
    expect(() => assertPageWindow({ page: 5000, pageSize: 10, afterCreatedAt: rows[0]!.createdAt, afterId: rows[0]!.id })).not.toThrow()
    expect(() => assertPageWindow({ page: 1, pageSize: 10, afterCreatedAt: 'yesterday', afterId: id(1) })).toThrow(/^Invalid pagination/)
  })

  it('offset paging still works and agrees with the cursor order', () => {
    const p2 = pageRows(rows, { page: 2, pageSize: 7 })
    const viaCursor = pageRows(rows, { page: 1, pageSize: 7, ...pageRows(rows, { page: 1, pageSize: 7 }).nextCursor! })
    expect(p2.rows).toEqual(viaCursor.rows)
  })
})

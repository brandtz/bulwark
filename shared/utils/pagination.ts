/**
 * shared/utils/pagination.ts — offset + opt-in keyset cursor paging (WP-L06 S3).
 *
 * - Offset paging stays the default for shallow pages but is capped at
 *   MAX_OFFSET_PAGE: deep OFFSETs scan and discard every skipped row.
 * - Passing `afterCreatedAt` + `afterId` (the `nextCursor` of the previous
 *   page) switches to keyset paging over (createdAt, id) newest-first, which
 *   costs the same at any depth and never skips or repeats a row.
 * - Real services build the window in SQL (server/services/_pagination.ts) and
 *   read the cursor timestamp back from the DB at full microsecond precision;
 *   mock rows only carry milliseconds, so `pageRows` / `nextCursorFor` derive it
 *   from the row. Either way the cursor is exact for its backend.
 */
export const MAX_OFFSET_PAGE = 1000

export interface ListCursor {
  afterCreatedAt: string
  afterId: string
}

export interface PageRequest {
  page: number
  pageSize: number
  afterCreatedAt?: string
  afterId?: string
}

export function hasCursor(input: PageRequest): input is PageRequest & ListCursor {
  return !!input.afterCreatedAt && !!input.afterId
}

/** Throws (message starts with "Invalid" → HTTP 400) for an unbounded offset. */
export function assertPageWindow(input: PageRequest): void {
  if (!hasCursor(input) && input.page > MAX_OFFSET_PAGE) {
    throw new Error(`Invalid pagination: page must be ≤ ${MAX_OFFSET_PAGE}; continue with the cursor (afterCreatedAt/afterId)`)
  }
  if (hasCursor(input) && Number.isNaN(Date.parse(input.afterCreatedAt))) {
    throw new Error('Invalid pagination: afterCreatedAt must be an ISO timestamp')
  }
}

interface Keyed { createdAt: string, id: string }

/** Newest first, id descending on ties — the order both backends use. */
export function compareNewestFirst(a: Keyed, b: Keyed): number {
  const ta = Date.parse(a.createdAt)
  const tb = Date.parse(b.createdAt)
  if (ta !== tb) return tb - ta
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/** Cursor for the page after `rows`, or null when this page was the last. */
export function nextCursorFor(rows: readonly Keyed[], pageSize: number): ListCursor | null {
  if (rows.length < pageSize || rows.length === 0) return null
  const last = rows[rows.length - 1]!
  return { afterCreatedAt: new Date(Date.parse(last.createdAt)).toISOString(), afterId: last.id }
}

/** In-memory paging (mocks): `sorted` must already be newest-first. */
export function pageRows<T extends Keyed>(sorted: readonly T[], input: PageRequest): { rows: T[], nextCursor: ListCursor | null } {
  assertPageWindow(input)
  let rows: T[]
  if (hasCursor(input)) {
    const edge = { createdAt: input.afterCreatedAt, id: input.afterId }
    rows = sorted.filter((r) => compareNewestFirst(r, edge) > 0).slice(0, input.pageSize)
  } else {
    const start = (input.page - 1) * input.pageSize
    rows = sorted.slice(start, start + input.pageSize)
  }
  return { rows, nextCursor: nextCursorFor(rows, input.pageSize) }
}

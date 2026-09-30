/**
 * server/services/_pagination.ts — SQL side of offset + keyset paging
 * (WP-L06 S3; semantics in shared/utils/pagination.ts).
 *
 * `pageWindow` returns the extra WHERE, the ORDER BY and the OFFSET for a list
 * query; both modes order by (created_at DESC NULLS LAST, id DESC). The L06
 * indexes are (organization_id, created_at DESC NULLS LAST): a plain DESC means
 * NULLS FIRST, which no index delivers, so every page sorted the org's rows in
 * memory. created_at is NOT NULL on every paged table, so NULLS LAST changes no
 * result; the index supplies the order and only equal timestamps are sorted by
 * id (Incremental Sort). timestamptz stores microseconds but the contract's ISO
 * strings carry milliseconds, so the cursor is NOT derived from a returned row:
 * `keysetCursor` reads the last row's exact timestamp back (one primary-key
 * lookup, only when there is a next page). A lossy cursor would skip or repeat
 * rows that share a millisecond.
 */
import { desc, eq, sql, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { getDb } from '../db/client'
import { assertPageWindow, hasCursor, type ListCursor, type PageRequest } from '../../shared/utils/pagination'

export interface PageWindow {
  where: SQL | undefined
  orderBy: SQL[]
  offset: number
}

export function pageWindow(input: PageRequest, createdAt: PgColumn, id: PgColumn): PageWindow {
  assertPageWindow(input)
  const orderBy = [sql`${createdAt} DESC NULLS LAST`, desc(id)]
  if (hasCursor(input)) {
    return {
      // The cursor string keeps its microseconds; never round-trip it through Date.
      where: sql`(${createdAt}, ${id}) < (${input.afterCreatedAt}::timestamptz, ${input.afterId}::uuid)`,
      orderBy,
      offset: 0,
    }
  }
  return { where: undefined, orderBy, offset: (input.page - 1) * input.pageSize }
}

type Reader = Pick<ReturnType<typeof getDb>, 'select'>

/** Exact cursor for the page after `rows` (raw DB rows, newest-first), or null on the last page. */
export async function keysetCursor(
  db: Reader,
  table: PgTable,
  createdAt: PgColumn,
  id: PgColumn,
  rows: ReadonlyArray<{ id: string }>,
  pageSize: number,
): Promise<ListCursor | null> {
  if (rows.length === 0 || rows.length < pageSize) return null
  const lastId = rows[rows.length - 1]!.id
  const [row] = await db
    .select({ ts: sql<string>`to_char(${createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` })
    .from(table)
    .where(eq(id, lastId))
    .limit(1)
  return row ? { afterCreatedAt: row.ts, afterId: lastId } : null
}

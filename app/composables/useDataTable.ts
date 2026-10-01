/**
 * useDataTable — headless sort + selection for BulwarkDataTable (WP-A3).
 *
 * The pure helpers are exported for unit tests (tests/unit/use-data-table.test.ts):
 *   - sortRows: stable (equal keys keep input order), nulls/empty last in both
 *     directions, numbers numeric, dates by time, strings by locale with
 *     numeric collation ("Unit 2" < "Unit 10"), mixed types grouped.
 *   - Selection: "select all" selects the LOADED rows only; selecting every
 *     matching row (allMatching) is a separate, explicit step, the bulk bar's
 *     "Select all N" (SPEC: 1,000 rows never selected by one header click).
 */
export type SortDir = 'asc' | 'desc'
export interface SortState { key: string, dir: SortDir }

type Cell = unknown
const isEmpty = (v: Cell) => v === null || v === undefined || v === ''
const rank = (v: Cell) => (typeof v === 'number' ? 0 : v instanceof Date ? 1 : typeof v === 'boolean' ? 2 : 3)
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function compareCells(a: Cell, b: Cell): number {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1
  const ra = rank(a), rb = rank(b)
  if (ra !== rb) return ra - rb
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return collator.compare(String(a), String(b))
}

export function sortRows<T>(rows: readonly T[], sort: SortState | null | undefined, get: (row: T, key: string) => Cell = (r, k) => (r as Record<string, Cell>)[k]): T[] {
  if (!sort) return [...rows]
  const dir = sort.dir === 'desc' ? -1 : 1
  return rows
    .map((row, i) => ({ row, i, v: get(row, sort.key) }))
    .sort((x, y) => {
      // Empties stay last whichever way the column is sorted.
      if (isEmpty(x.v) || isEmpty(y.v)) return compareCells(x.v, y.v) || x.i - y.i
      return dir * compareCells(x.v, y.v) || x.i - y.i
    })
    .map((x) => x.row)
}

/** Next sort when a header is activated: none → asc → desc → none. */
export function nextSort(current: SortState | null | undefined, key: string): SortState | null {
  if (!current || current.key !== key) return { key, dir: 'asc' }
  return current.dir === 'asc' ? { key, dir: 'desc' } : null
}

export interface Selection {
  /** Row keys selected on the loaded rows. */
  keys: Set<string>
  /** The user confirmed "select all N matching" (every row, loaded or not). */
  allMatching: boolean
}

export function emptySelection(): Selection {
  return { keys: new Set(), allMatching: false }
}

export function toggleKey(s: Selection, key: string): Selection {
  const keys = new Set(s.keys)
  if (keys.has(key)) keys.delete(key)
  else keys.add(key)
  return { keys, allMatching: false }
}

/** Header checkbox: select every LOADED row, or clear when all are selected. */
export function togglePage(s: Selection, loadedKeys: readonly string[]): Selection {
  const allOn = loadedKeys.length > 0 && loadedKeys.every((k) => s.keys.has(k))
  return allOn ? emptySelection() : { keys: new Set(loadedKeys), allMatching: false }
}

export function selectAllMatching(s: Selection): Selection {
  return { keys: s.keys, allMatching: true }
}

export function headerState(s: Selection, loadedKeys: readonly string[]): 'none' | 'some' | 'all' {
  if (s.allMatching) return 'all'
  const n = loadedKeys.filter((k) => s.keys.has(k)).length
  return n === 0 ? 'none' : n === loadedKeys.length ? 'all' : 'some'
}

export function selectedCount(s: Selection, total: number): number {
  return s.allMatching ? total : s.keys.size
}

/** Reactive wrapper used by BulwarkDataTable. */
export function useDataTable<T>(rows: () => readonly T[], rowKey: () => string, sort: () => SortState | null | undefined) {
  const selection = ref<Selection>(emptySelection())
  const keyOf = (r: T) => String((r as Record<string, unknown>)[rowKey()])
  const sorted = computed(() => sortRows(rows(), sort()))
  const loadedKeys = computed(() => rows().map(keyOf))
  return {
    sorted,
    selection,
    keyOf,
    loadedKeys,
    toggle: (k: string) => { selection.value = toggleKey(selection.value, k) },
    togglePage: () => { selection.value = togglePage(selection.value, loadedKeys.value) },
    selectAllMatching: () => { selection.value = selectAllMatching(selection.value) },
    clear: () => { selection.value = emptySelection() },
    header: computed(() => headerState(selection.value, loadedKeys.value)),
  }
}

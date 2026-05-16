/**
 * app/composables/useGlobalSearch.ts — global Cmd-K search palette state
 * (W4-1 / EH-P / ADR-0033).
 *
 * # What this file does
 *   - Owns the singleton state for the top-bar search palette:
 *     `isOpen`, `query`, `results`, `loading`. The component layer is
 *     a thin renderer over this state.
 *   - Debounces query input by 200ms before calling
 *     `searchService.search({ organizationId, query, limit: 25 })`.
 *     Stale-response guard: only the latest issued query is allowed
 *     to mutate `results`; older in-flight responses are dropped.
 *
 * # Decisions (ADR-0008, ADR-0033)
 *   - **Singleton via `useState`.** The palette can be opened from
 *     anywhere (top bar, keyboard shortcut, an empty-state CTA),
 *     so the state must survive component unmounts.
 *   - **Pure debounce helper exported for tests.** `createDebouncer`
 *     is the time-only primitive; the composable plugs it into Vue
 *     reactivity. The vitest unit drives `createDebouncer` directly
 *     so we don't need a Vue mount harness.
 *   - **Service errors collapse to "no results".** A failing search
 *     should never crash the palette — we surface an empty list and
 *     let the user retry.
 *   - **Auto-clear on close.** Reopening the palette starts fresh;
 *     this matches the "type-to-find" Cmd-K convention.
 *
 * # Decision cast down
 *   - Streaming partial results per entity type. Rejected — the
 *     contract returns the full union in one shot; per-type
 *     pagination would duplicate scoring + add visible "loading"
 *     flicker that hurts the cmd-k feel.
 */
import type { SearchEntityType, SearchResult } from '~~/shared/contracts/search'

export interface GlobalSearchState {
  isOpen: boolean
  query: string
  results: SearchResult[]
  loading: boolean
}

export interface DebouncerHandle {
  schedule: (fn: () => void) => void
  cancel: () => void
}

/**
 * Pure (Vue-free) debounce primitive. Exported for the vitest unit so we
 * can lock the timing behavior without booting Nuxt's reactivity runtime.
 * Each `schedule` call replaces the previous pending callback.
 */
export function createDebouncer(ms: number): DebouncerHandle {
  let handle: ReturnType<typeof setTimeout> | null = null
  return {
    schedule(fn: () => void) {
      if (handle !== null) clearTimeout(handle)
      handle = setTimeout(() => {
        handle = null
        fn()
      }, ms)
    },
    cancel() {
      if (handle !== null) {
        clearTimeout(handle)
        handle = null
      }
    },
  }
}

/**
 * Group hits by entityType, preserving insertion order. Pure helper so
 * the palette template can render `for (group of groupResults(results))`
 * directly. Exported for the vitest unit.
 */
export function groupResults(
  rows: readonly SearchResult[],
): { entityType: SearchEntityType; rows: SearchResult[] }[] {
  const order: SearchEntityType[] = []
  const buckets = new Map<SearchEntityType, SearchResult[]>()
  for (const r of rows) {
    if (!buckets.has(r.entityType)) {
      order.push(r.entityType)
      buckets.set(r.entityType, [])
    }
    buckets.get(r.entityType)!.push(r)
  }
  return order.map((t) => ({ entityType: t, rows: buckets.get(t)! }))
}

const DEBOUNCE_MS = 200
const LIMIT = 25

export function useGlobalSearch() {
  const state = useState<GlobalSearchState>('bulwark.global-search', () => ({
    isOpen: false,
    query: '',
    results: [],
    loading: false,
  }))

  // Selection index for keyboard nav. Lives outside the persisted state
  // shape so the test surface stays small.
  const selectedIndex = useState<number>('bulwark.global-search.idx', () => 0)

  // Per-call serial so a stale response cannot clobber a fresher one.
  const serial = useState<number>('bulwark.global-search.serial', () => 0)

  const debouncer = createDebouncer(DEBOUNCE_MS)

  async function run(query: string) {
    const trimmed = query.trim()
    if (!trimmed) {
      state.value.results = []
      state.value.loading = false
      return
    }
    const { session, ensureLoaded } = useSession()
    await ensureLoaded()
    const orgId = session.value?.activeOrganizationId
    if (!orgId) {
      state.value.results = []
      state.value.loading = false
      return
    }
    const mySerial = ++serial.value
    state.value.loading = true
    try {
      const search = useService('search')
      const out = await search.search({
        organizationId: orgId,
        query: trimmed,
        limit: LIMIT,
      })
      // Stale-response guard.
      if (mySerial === serial.value) {
        state.value.results = out.results
        selectedIndex.value = 0
      }
    } catch {
      if (mySerial === serial.value) state.value.results = []
    } finally {
      if (mySerial === serial.value) state.value.loading = false
    }
  }

  function open() {
    state.value.isOpen = true
  }

  function close() {
    debouncer.cancel()
    state.value.isOpen = false
    state.value.query = ''
    state.value.results = []
    state.value.loading = false
    selectedIndex.value = 0
  }

  function setQuery(v: string) {
    state.value.query = v
    // Schedule a debounced search; if empty, clear immediately.
    if (!v.trim()) {
      debouncer.cancel()
      state.value.results = []
      state.value.loading = false
      return
    }
    debouncer.schedule(() => {
      void run(state.value.query)
    })
  }

  function moveSelection(delta: number) {
    const max = state.value.results.length - 1
    if (max < 0) {
      selectedIndex.value = 0
      return
    }
    const next = selectedIndex.value + delta
    if (next < 0) selectedIndex.value = 0
    else if (next > max) selectedIndex.value = max
    else selectedIndex.value = next
  }

  return {
    state,
    selectedIndex,
    open,
    close,
    setQuery,
    moveSelection,
    /** Exposed for the vitest unit so it can drive the debounced path. */
    _runImmediate: run,
  }
}

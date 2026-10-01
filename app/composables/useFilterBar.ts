/**
 * useFilterBar — URL-synced filters for BulwarkFilterBar (WP-A3).
 *
 * Filters live in the query string so a view is shareable and survives a
 * reload (SPEC). Each filter key holds a list of values; lists serialise as
 * repeated params (?status=lead&status=quoted). Dates are ISO yyyy-mm-dd.
 * Parsing is defensive: unknown keys, values not in a filter's options and
 * malformed dates are dropped, never thrown. Exported pure helpers are unit
 * tested (tests/unit/use-filter-bar.test.ts).
 */
import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export type FilterType = 'select' | 'multiselect' | 'date' | 'text' | 'boolean'
export interface FilterDef { key: string, label: string, type: FilterType, options?: Array<{ value: string, label: string }> }
export type FilterModel = Record<string, string[]>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u

function valid(def: FilterDef, v: string): boolean {
  if (!v) return false
  if (def.type === 'date') return ISO_DATE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())
  if (def.type === 'boolean') return v === 'true' || v === 'false'
  if (def.options) return def.options.some((o) => o.value === v)
  return v.length <= 200
}

export function fromQuery(query: LocationQuery | Record<string, unknown>, filters: readonly FilterDef[]): FilterModel {
  const model: FilterModel = {}
  for (const def of filters) {
    const raw = query[def.key]
    const list = (Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw])
      .filter((v): v is string => typeof v === 'string')
      .filter((v) => valid(def, v))
    const unique = [...new Set(list)]
    const kept = def.type === 'select' || def.type === 'boolean' || def.type === 'text' ? unique.slice(0, 1) : unique
    if (kept.length) model[def.key] = kept
  }
  return model
}

/** Filter params only; other query keys (page, sort, tab) are preserved by mergeQuery. */
export function toQuery(model: FilterModel, filters: readonly FilterDef[]): LocationQueryRaw {
  const out: LocationQueryRaw = {}
  for (const def of filters) {
    const values = (model[def.key] ?? []).filter((v) => valid(def, v))
    if (values.length) out[def.key] = values.length === 1 ? values[0]! : values
  }
  return out
}

export function mergeQuery(current: LocationQuery, model: FilterModel, filters: readonly FilterDef[]): LocationQueryRaw {
  // Drop this bar's keys and `page` (a new filter starts at page 1); keep the rest.
  const owned = new Set([...filters.map((f) => f.key), 'page'])
  const rest = Object.fromEntries(Object.entries(current).filter(([k]) => !owned.has(k))) as LocationQueryRaw
  return { ...rest, ...toQuery(model, filters) }
}

export function activeCount(model: FilterModel): number {
  return Object.values(model).reduce((n, v) => n + v.length, 0)
}

/** Reactive binding to the current route. */
export function useFilterBar(filters: () => readonly FilterDef[]) {
  const route = useRoute()
  const router = useRouter()
  const model = computed<FilterModel>(() => fromQuery(route.query, filters()))
  function set(next: FilterModel) {
    return router.replace({ query: mergeQuery(route.query, next, filters()) })
  }
  function clear() {
    return set({})
  }
  return { model, set, clear, active: computed(() => activeCount(model.value)) }
}

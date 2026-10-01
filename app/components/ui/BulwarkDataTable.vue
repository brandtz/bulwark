<!--
  BulwarkDataTable.vue — the list table (Packet A components/SPEC.md, WP-A3).

  Table semantics are kept: sortable headers are buttons inside <th aria-sort>;
  rows take a roving tabindex (Up/Down/Home/End move, Enter opens = row-click).
  Selection checkboxes are labelled with the row's title. The header checkbox
  selects the LOADED rows only; the bulk bar then offers "Select all N" when
  more rows match (useDataTable). Bulk actions emit `bulk` with the selection;
  row actions open a BulwarkMenu. Below 768px the same rows render as a card
  list (<ul>) from the `card` slot (default: title + three fields) — never a
  sideways-scrolling table.

  `sort` is controlled: the table emits the next sort and the page refetches
  (or sorts client-side with sortRows). Loading shows a table skeleton, error
  an error EmptyState, no rows the `empty` slot or an EmptyState flavor.
  `virtualize` is accepted for SPEC parity; lists are paged (WP-L06), so rows
  render directly.
-->
<script setup lang="ts" generic="T extends Record<string, unknown>">
import type { MenuEntry } from './BulwarkMenu.vue'
import { nextSort, type SortState } from '~/composables/useDataTable'

export interface Column {
  key: string
  label: string
  sortable?: boolean
  align?: 'start' | 'end'
  width?: string
  pinned?: boolean
  hidden?: boolean
  /** Money/number column: right-aligned tabular (SPEC). */
  numeric?: boolean
}
export interface BulkAction { label: string, value: string, destructive?: boolean }

interface Props {
  columns: Column[]
  rows: T[]
  rowKey?: string
  /** Column whose value names a row (checkbox labels, card titles). Default: first column. */
  titleKey?: string
  selectable?: boolean
  bulkActions?: BulkAction[]
  rowActions?: (row: T) => MenuEntry[]
  sort?: SortState | null
  /** Total matching rows (for "Select all N"); defaults to the loaded count. */
  total?: number
  hasMore?: boolean
  loading?: boolean
  error?: boolean
  emptyFlavor?: 'first-run' | 'no-results'
  emptyTitle?: string
  virtualize?: boolean
  caption?: string
}
const props = withDefaults(defineProps<Props>(), {
  rowKey: 'id',
  titleKey: undefined,
  selectable: false,
  bulkActions: () => [],
  rowActions: undefined,
  sort: null,
  total: undefined,
  hasMore: false,
  loading: false,
  error: false,
  emptyFlavor: 'no-results',
  emptyTitle: undefined,
  virtualize: false,
  caption: undefined,
})
const emit = defineEmits<{
  'sort': [sort: SortState | null]
  'select': [selection: { keys: string[], allMatching: boolean }]
  'row-click': [row: T]
  'bulk': [action: string, selection: { keys: string[], allMatching: boolean }]
  'load-more': []
}>()
const visibleCols = computed(() => props.columns.filter((c) => !c.hidden))
const titleCol = computed(() => props.titleKey ?? visibleCols.value[0]?.key ?? props.rowKey)
const table = useDataTable(() => props.rows, () => props.rowKey, () => null)
const keyOf = table.keyOf
const matching = computed(() => props.total ?? props.rows.length)
const count = computed(() => (table.selection.value.allMatching ? matching.value : table.selection.value.keys.size))

function emitSelect() {
  emit('select', { keys: [...table.selection.value.keys], allMatching: table.selection.value.allMatching })
}
function toggleRow(k: string) { table.toggle(k); emitSelect() }
function togglePage() { table.togglePage(); emitSelect() }
function allMatching() { table.selectAllMatching(); emitSelect() }
function clearSel() { table.clear(); emitSelect() }

function ariaSort(c: Column): 'ascending' | 'descending' | 'none' | undefined {
  if (!c.sortable) return undefined
  if (props.sort?.key !== c.key) return 'none'
  return props.sort.dir === 'asc' ? 'ascending' : 'descending'
}

// Roving tabindex across rows.
const focusRow = ref(0)
const rowEls = ref<HTMLElement[]>([])
function onRowKey(e: KeyboardEvent, i: number, row: T) {
  const last = props.rows.length - 1
  const next = e.key === 'ArrowDown' ? Math.min(last, i + 1) : e.key === 'ArrowUp' ? Math.max(0, i - 1)
    : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1
  if (e.key === 'Enter' && e.target === e.currentTarget) { emit('row-click', row); return }
  if (next < 0) return
  e.preventDefault()
  focusRow.value = next
  rowEls.value[next]?.focus()
}

const headerChecked = computed(() => table.header.value === 'all')
const headerIndeterminate = computed(() => table.header.value === 'some')
const display = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))
</script>

<template>
  <div class="bw-datatable">
    <!-- Bulk bar (accent-900) while anything is selected. -->
    <div
      v-if="selectable && count > 0"
      class="flex flex-wrap items-center gap-2 px-4 py-2"
      style="background: var(--accent-900); color: #fff; font-size: 13px; border-radius: var(--radius-md) var(--radius-md) 0 0"
      role="region"
      aria-label="Bulk actions"
      data-testid="datatable-bulk-bar"
    >
      <span aria-live="polite" class="font-semibold mr-2">{{ count }} selected</span>
      <button
        v-if="!table.selection.value.allMatching && matching > rows.length && table.header.value === 'all'"
        type="button"
        class="underline"
        data-testid="datatable-select-all-matching"
        @click="allMatching"
      >Select all {{ matching }}</button>
      <button
        v-for="a in bulkActions"
        :key="a.value"
        type="button"
        class="px-2 py-1 rounded hover:bg-white/10"
        @click="emit('bulk', a.value, { keys: [...table.selection.value.keys], allMatching: table.selection.value.allMatching })"
      >{{ a.label }}</button>
      <button type="button" class="ml-auto px-2 py-1 rounded hover:bg-white/10" @click="clearSel">Clear</button>
    </div>

    <BulwarkSkeleton v-if="loading" kind="table" :rows="6" :columns="Math.min(visibleCols.length, 6)" />
    <EmptyState v-else-if="error" flavor="error" title="Couldn’t load this list" body="Try again in a moment." />
    <template v-else-if="!rows.length">
      <slot name="empty">
        <EmptyState :flavor="emptyFlavor" :title="emptyTitle ?? (emptyFlavor === 'no-results' ? 'Nothing matches these filters' : 'Nothing here yet')" />
      </slot>
    </template>

    <template v-else>
      <!-- Table (768px and up). -->
      <div class="bw-datatable__table overflow-x-auto">
        <table class="bw-table">
          <caption v-if="caption" class="sr-only">{{ caption }}</caption>
          <thead>
            <tr>
              <th v-if="selectable" style="width: 40px">
                <input
                  type="checkbox"
                  :checked="headerChecked"
                  :indeterminate="headerIndeterminate"
                  aria-label="Select all rows on this page"
                  style="width: 18px; height: 18px; accent-color: var(--accent)"
                  data-testid="datatable-select-page"
                  @change="togglePage"
                >
              </th>
              <th
                v-for="c in visibleCols"
                :key="c.key"
                :class="(c.numeric || c.align === 'end') && 'num'"
                :style="c.width ? { width: c.width } : undefined"
                :aria-sort="ariaSort(c)"
                scope="col"
              >
                <button
                  v-if="c.sortable"
                  type="button"
                  class="inline-flex items-center gap-1"
                  @click="emit('sort', nextSort(sort, c.key))"
                >
                  {{ c.label }}
                  <BulwarkIcon
                    v-if="sort?.key === c.key"
                    :name="sort.dir === 'asc' ? 'chevron-up' : 'chevron-down'"
                    size="sm"
                  />
                </button>
                <span v-else>{{ c.label }}</span>
              </th>
              <th v-if="rowActions" style="width: 40px"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in rows"
              :key="keyOf(row)"
              :ref="(el) => { if (el) rowEls[i] = el as HTMLElement }"
              :class="{ 'is-selected': table.selection.value.allMatching || table.selection.value.keys.has(keyOf(row)) }"
              :tabindex="i === focusRow ? 0 : -1"
              :data-row-key="keyOf(row)"
              data-testid="datatable-row"
              class="cursor-pointer focus:outline-none"
              @click="emit('row-click', row)"
              @keydown="onRowKey($event, i, row)"
              @focus="focusRow = i"
            >
              <td v-if="selectable" @click.stop>
                <input
                  type="checkbox"
                  :checked="table.selection.value.allMatching || table.selection.value.keys.has(keyOf(row))"
                  :aria-label="`Select ${display(row[titleCol])}`"
                  style="width: 18px; height: 18px; accent-color: var(--accent)"
                  @change="toggleRow(keyOf(row))"
                >
              </td>
              <td v-for="c in visibleCols" :key="c.key" :class="(c.numeric || c.align === 'end') && 'num'">
                <slot :name="`cell-${c.key}`" :row="row" :value="row[c.key]">{{ display(row[c.key]) }}</slot>
              </td>
              <td v-if="rowActions" @click.stop>
                <BulwarkMenu :items="rowActions(row)" align="end" :label="`Actions for ${display(row[titleCol])}`">
                  <template #trigger="{ toggle, attrs }">
                    <button type="button" class="bw-btn bw-btn--ghost bw-btn--icon bw-btn--sm" :aria-label="`Actions for ${display(row[titleCol])}`" v-bind="attrs" @click="toggle">
                      <BulwarkIcon name="more-horizontal" size="sm" />
                    </button>
                  </template>
                </BulwarkMenu>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Card list (under 768px). -->
      <ul class="bw-datatable__cards flex flex-col gap-2" :aria-label="caption">
        <li v-for="row in rows" :key="keyOf(row)" data-testid="datatable-card">
          <slot name="card" :row="row">
            <div class="bw-card bw-card--sm bw-card--clickable" role="button" tabindex="0" @click="emit('row-click', row)" @keydown.enter="emit('row-click', row)">
              <div class="flex items-start gap-2">
                <input
                  v-if="selectable"
                  type="checkbox"
                  :checked="table.selection.value.allMatching || table.selection.value.keys.has(keyOf(row))"
                  :aria-label="`Select ${display(row[titleCol])}`"
                  style="width: 20px; height: 20px; accent-color: var(--accent)"
                  @click.stop
                  @change="toggleRow(keyOf(row))"
                >
                <div class="min-w-0 flex-1">
                  <p class="font-semibold truncate">
                    <slot :name="`cell-${titleCol}`" :row="row" :value="row[titleCol]">{{ display(row[titleCol]) }}</slot>
                  </p>
                  <dl class="bw-kv mt-1" style="grid-template-columns: max-content 1fr; gap: 2px 12px">
                    <template v-for="c in visibleCols.filter((c) => c.key !== titleCol).slice(0, 3)" :key="c.key">
                      <dt>{{ c.label }}</dt>
                      <dd :class="c.numeric && 'tnum'"><slot :name="`cell-${c.key}`" :row="row" :value="row[c.key]">{{ display(row[c.key]) }}</slot></dd>
                    </template>
                  </dl>
                </div>
              </div>
            </div>
          </slot>
        </li>
      </ul>

      <div v-if="hasMore" class="flex justify-center p-3">
        <BulwarkButton variant="secondary" size="sm" @click="emit('load-more')">Load more</BulwarkButton>
      </div>
    </template>
  </div>
</template>

<style>
.bw-datatable__cards { display: none; }
@media (max-width: 767px) {
  .bw-datatable__table { display: none; }
  .bw-datatable__cards { display: flex; }
}
.bw-table th[aria-sort] button { font: inherit; color: inherit; }
</style>

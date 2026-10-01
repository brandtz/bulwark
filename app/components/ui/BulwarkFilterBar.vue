<!--
  BulwarkFilterBar.vue — list filters (Packet A components/SPEC.md, WP-A3).

  A `text` filter is the search box (labelled, "/" focuses it). Every other
  filter is a chip button (aria-expanded) that opens a popover: checkboxes
  (multiselect), radios (select / boolean) or a date. Active chips turn accent
  and show their count. Sort is a BulwarkMenu; "Saved views" emits save-view.
  The summary row (aria-live=polite) always shows the matching count, never
  hidden (SPEC), with "Clear all".

  Controlled: emits update:modelValue with the whole model. Pages bind it to
  useFilterBar() so the state lives in the URL query (shareable, reload-safe).
-->
<script setup lang="ts">
import type { FilterDef, FilterModel } from '~/composables/useFilterBar'
import type { MenuEntry } from './BulwarkMenu.vue'

interface Props {
  filters: FilterDef[]
  modelValue: FilterModel
  sortOptions?: Array<{ key: string, label: string }>
  sortKey?: string | null
  savedViews?: boolean
  total?: number | null
  matching?: number | null
  searchPlaceholder?: string
}
const props = withDefaults(defineProps<Props>(), {
  sortOptions: () => [],
  sortKey: null,
  savedViews: true,
  total: null,
  matching: null,
  searchPlaceholder: 'Search…',
})
const emit = defineEmits<{
  'update:modelValue': [model: FilterModel]
  'sort': [key: string]
  'save-view': []
  'clear': []
}>()

const search = computed(() => props.filters.find((f) => f.type === 'text'))
const chips = computed(() => props.filters.filter((f) => f.type !== 'text'))
const openKey = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)
const uid = useId()

const valuesOf = (key: string) => props.modelValue[key] ?? []
const activeTotal = computed(() => chips.value.reduce((n, f) => n + valuesOf(f.key).length, 0) + (search.value && valuesOf(search.value.key).length ? 1 : 0))

function set(key: string, values: string[]) {
  const rest = Object.fromEntries(Object.entries(props.modelValue).filter(([k]) => k !== key))
  emit('update:modelValue', values.length ? { ...rest, [key]: values } : rest)
}

function toggleValue(f: FilterDef, v: string) {
  const cur = valuesOf(f.key)
  if (f.type === 'multiselect') set(f.key, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v])
  else set(f.key, cur[0] === v ? [] : [v])
}

function openChip(key: string) {
  openKey.value = openKey.value === key ? null : key
  if (openKey.value) nextTick(() => root.value?.querySelector<HTMLElement>(`#${uid}-pop-${key} input`)?.focus())
}

function onOutside(e: PointerEvent) {
  if (openKey.value && root.value && !(e.target as HTMLElement).closest(`[data-chip="${openKey.value}"]`)) openKey.value = null
}
onMounted(() => document.addEventListener('pointerdown', onOutside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))

const sortItems = computed<MenuEntry[]>(() => props.sortOptions.map((o) => ({ label: o.label, value: o.key })))
const sortLabel = computed(() => props.sortOptions.find((o) => o.key === props.sortKey)?.label ?? 'Sort')

function clearAll() {
  emit('update:modelValue', {})
  emit('clear')
}

let timer: ReturnType<typeof setTimeout> | undefined
function onSearch(v: string) {
  if (!search.value) return
  const key = search.value.key
  clearTimeout(timer)
  timer = setTimeout(() => set(key, v.trim() ? [v.trim()] : []), 250)
}
</script>

<template>
  <div ref="root" class="flex flex-col gap-2" data-testid="filter-bar">
    <div class="flex flex-wrap items-center gap-2">
      <div v-if="search" class="w-full sm:w-72">
        <BulwarkSearchField
          :model-value="valuesOf(search.key)[0] ?? ''"
          :placeholder="searchPlaceholder"
          :aria-label="search.label"
          @update:model-value="onSearch"
        />
      </div>

      <div v-for="f in chips" :key="f.key" class="relative" :data-chip="f.key">
        <button
          type="button"
          class="bw-chip"
          :class="valuesOf(f.key).length ? 'bw-chip--accent' : ''"
          style="height: 32px; padding: 0 12px; font-size: 13px; cursor: pointer"
          :aria-expanded="openKey === f.key"
          :aria-controls="`${uid}-pop-${f.key}`"
          :data-testid="`filter-chip-${f.key}`"
          @click="openChip(f.key)"
          @keydown.esc="openKey = null"
        >
          {{ f.label }}<span v-if="valuesOf(f.key).length" class="tnum">{{ valuesOf(f.key).length }}</span>
          <BulwarkIcon name="chevron-down" size="sm" />
        </button>
        <div
          v-if="openKey === f.key"
          :id="`${uid}-pop-${f.key}`"
          class="bw-menu absolute left-0 top-full mt-1"
          style="z-index: var(--z-dropdown); min-width: 220px"
          role="group"
          :aria-label="f.label"
          @keydown.esc="openKey = null"
        >
          <template v-if="f.type === 'date'">
            <label class="bw-label px-2 pt-1" :for="`${uid}-date-${f.key}`">{{ f.label }}</label>
            <input
              :id="`${uid}-date-${f.key}`"
              type="date"
              class="bw-input mt-1"
              :value="valuesOf(f.key)[0] ?? ''"
              @change="set(f.key, ($event.target as HTMLInputElement).value ? [($event.target as HTMLInputElement).value] : [])"
            >
          </template>
          <template v-else>
            <label v-for="o in (f.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : f.options ?? [])" :key="o.value" class="item">
              <input
                :type="f.type === 'multiselect' ? 'checkbox' : 'radio'"
                :name="`${uid}-${f.key}`"
                :checked="valuesOf(f.key).includes(o.value)"
                style="accent-color: var(--accent)"
                @change="toggleValue(f, o.value)"
              >
              {{ o.label }}
            </label>
          </template>
        </div>
      </div>

      <div class="flex items-center gap-2 ml-auto">
        <slot name="extra-actions" />
        <BulwarkMenu v-if="sortItems.length" :items="sortItems" align="end" label="Sort by" @select="emit('sort', $event.value!)">
          <template #trigger="{ toggle, attrs }">
            <button type="button" class="bw-btn bw-btn--secondary bw-btn--sm" v-bind="attrs" @click="toggle">
              <BulwarkIcon name="list" size="sm" />{{ sortLabel }}
            </button>
          </template>
        </BulwarkMenu>
        <BulwarkButton v-if="savedViews" variant="secondary" size="sm" @click="emit('save-view')">Saved views</BulwarkButton>
      </div>
    </div>

    <div class="flex items-center gap-3 bw-help" aria-live="polite" data-testid="filter-summary">
      <span v-if="matching !== null">
        Showing <strong class="tnum">{{ matching }}</strong><template v-if="total !== null && total !== matching"> of <span class="tnum">{{ total }}</span></template>
      </span>
      <button v-if="activeTotal" type="button" class="bw-btn bw-btn--link bw-btn--sm" data-testid="filter-clear" @click="clearAll">Clear all</button>
    </div>
  </div>
</template>

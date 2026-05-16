<!--
  app/components/search/SearchPalette.vue — Cmd-K global search overlay
  (W4-1 / EH-P / ADR-0033).

  # Decisions (ADR-0008, ADR-0033)
    - Centered overlay (NOT a slide-out drawer): matches the dominant
      Cmd-K affordance across modern admin apps (Linear / Notion).
    - Renders ONLY when `state.isOpen` is true. Mounted via Teleport
      so it sits above the topbar / sidebar without z-index gymnastics.
    - Results are NuxtLinks so middle-click + cmd-click open in new
      tabs without us reimplementing browser semantics.
    - Keyboard:
        ↑ / ↓ — move selection (clamped at ends)
        Enter — navigate to the selected hit
        Esc   — close
    - Status copy (`search.placeholder`, `search.empty`, `search.loading`)
      flows through `useLabel().t(...)` per the CMS contract.

  # Decision cast down
    - Inline rendering inside AppTopBar — rejected. The palette is
      modal chrome; keeping it as a top-level overlay keeps the
      topbar slot free of the (admittedly heavy) results list.
-->
<script setup lang="ts">
import { groupResults } from '~/composables/useGlobalSearch'

const { state, selectedIndex, close, setQuery, moveSelection } = useGlobalSearch()
const { t } = useLabel()

const groups = computed(() => groupResults(state.value.results))

// Flat order matches `state.results` so the selected index lines up
// across groups when ↑/↓ pressed.
const flat = computed(() => state.value.results)

function onKeydown(e: KeyboardEvent) {
  if (!state.value.isOpen) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveSelection(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveSelection(-1)
    return
  }
  if (e.key === 'Enter') {
    const hit = flat.value[selectedIndex.value]
    if (hit) {
      e.preventDefault()
      const url = hit.url
      close()
      void navigateTo(url)
    }
  }
}

// Bind/unbind based on open state so we never leak a global listener.
watch(
  () => state.value.isOpen,
  (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      document.addEventListener('keydown', onKeydown)
      // Defer focus so the modal element exists in the DOM.
      nextTick(() => {
        const el = document.querySelector<HTMLInputElement>('[data-testid="search-palette-input"]')
        el?.focus()
      })
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  },
)

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', onKeydown)
  }
})

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  setQuery(target.value)
}

function entityTypeLabel(t: string): string {
  switch (t) {
    case 'work-order':
      return 'Work orders'
    case 'subcontractor':
      return 'Subcontractors'
    default:
      return t.charAt(0).toUpperCase() + t.slice(1) + 's'
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.isOpen"
        class="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-black/40"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        data-testid="search-palette"
        @click.self="close"
      >
        <div class="w-full max-w-xl rounded-card bg-surface shadow-xl border border-border overflow-hidden">
          <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
            <BulwarkIcon name="search" size="md" class="text-text-secondary" />
            <input
              type="text"
              :value="state.query"
              :placeholder="t('search', 'placeholder', 'Search… ⌘K')"
              class="flex-1 bg-transparent outline-none text-body text-text-primary placeholder:text-text-secondary"
              data-testid="search-palette-input"
              autocomplete="off"
              spellcheck="false"
              @input="onInput"
            />
            <button
              type="button"
              class="text-tiny text-text-secondary px-2 py-0.5 rounded border border-border"
              data-testid="search-palette-close"
              @click="close"
            >Esc</button>
          </div>

          <div class="max-h-[60vh] overflow-y-auto">
            <p
              v-if="state.loading"
              class="px-4 py-6 text-small text-text-secondary"
              data-testid="search-palette-loading"
            >{{ t('search', 'loading', 'Searching…') }}</p>

            <p
              v-else-if="state.query.trim() && state.results.length === 0"
              class="px-4 py-6 text-small text-text-secondary"
              data-testid="search-palette-empty"
            >{{ t('search', 'empty', 'No results. Try a different search.') }}</p>

            <ul v-else>
              <template v-for="group in groups" :key="group.entityType">
                <li
                  class="px-3 pt-3 pb-1 text-tiny uppercase tracking-wide text-text-secondary"
                  data-testid="search-palette-group-heading"
                >{{ entityTypeLabel(group.entityType) }}</li>
                <li
                  v-for="row in group.rows"
                  :key="`${row.entityType}-${row.id}`"
                >
                  <NuxtLink
                    :to="row.url"
                    class="block px-4 py-2 hover:bg-surface-muted"
                    :class="flat[selectedIndex]?.id === row.id ? 'bg-surface-muted' : ''"
                    data-testid="search-palette-result"
                    :data-entity-type="row.entityType"
                    :data-entity-id="row.id"
                    @click="close"
                  >
                    <p class="text-body text-text-primary truncate">{{ row.title }}</p>
                    <p v-if="row.subtitle" class="text-small text-text-secondary truncate">
                      {{ row.subtitle }}
                    </p>
                  </NuxtLink>
                </li>
              </template>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

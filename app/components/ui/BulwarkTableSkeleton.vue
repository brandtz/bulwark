<!--
  BulwarkTableSkeleton.vue — shimmer placeholder for list/table loading
  states (W2-6 / EH-L).

  # Why this component exists
  --------------------------
  The generic `BulwarkSkeleton` is great for a one-off rectangle, but
  every list page in admin needs the same N-rows-by-M-columns block.
  Copy-pasting Tailwind `animate-pulse` divs into ten pages was the
  smell that EH-L promised to fix. This is the canonical loading
  skeleton for any tabular / row-list surface.

  # Decisions (ADR-0026)
    - **Token-only styling**: `animate-pulse` + `bg-slate-200` matches
      the spec verbatim. No theming knob — every list looks identical.
    - **Header rendering is opt-out**: most list pages have a sticky
      header above the rows. `showHeader=false` lets the skeleton sit
      flush under a real header without duplicating it.
    - **`aria-busy` + `aria-live="polite"`**: screen-reader users get
      told "loading…" without an explicit string in the DOM. Matches
      `BulwarkSkeleton` conventions.
    - **No prop validation of rows/cols upper bounds**: callers pass
      sensible numbers (5×4 by default). A guard would just hide bugs.

  # Decisions NOT taken
    - **No per-column width prop**. The shimmer is intentionally a flat
      grid — designers asked for "indeterminate shape" so the user
      doesn't expect a specific layout. If a list needs column-aware
      skeleton, a future component handles it.
-->
<script setup lang="ts">
interface Props {
  /** Number of skeleton rows to render. */
  rows?: number
  /** Cells per row. */
  cols?: number
  /** Render a slightly-bolder header row above the body. */
  showHeader?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  rows: 5,
  cols: 4,
  showHeader: true,
})
</script>

<template>
  <div
    :aria-busy="true"
    aria-live="polite"
    class="w-full animate-pulse"
    data-testid="bulwark-table-skeleton"
  >
    <div
      v-if="props.showHeader"
      class="mb-2 grid gap-3"
      :style="{ gridTemplateColumns: `repeat(${props.cols}, minmax(0, 1fr))` }"
      data-testid="bulwark-table-skeleton-header"
    >
      <div
        v-for="c in props.cols"
        :key="`h-${c}`"
        class="h-4 rounded bg-slate-300"
      />
    </div>
    <div class="flex flex-col gap-3">
      <div
        v-for="r in props.rows"
        :key="`r-${r}`"
        class="grid gap-3"
        :style="{ gridTemplateColumns: `repeat(${props.cols}, minmax(0, 1fr))` }"
        data-testid="bulwark-table-skeleton-row"
      >
        <div
          v-for="c in props.cols"
          :key="`r-${r}-c-${c}`"
          class="h-10 rounded bg-slate-200"
        />
      </div>
    </div>
  </div>
</template>

<!--
  app/components/property/PipelineColumn.vue — kanban column (E3-S1).

  # Decisions (ADR-0008)
    - One column per `PropertyStatus`. Header shows the human label
      (PROPERTY_STATUS_LABEL) + a count chip; body is a vertical scroll
      list of cards via the default slot.
    - The column carries `data-testid="pipeline-column"` and
      `:data-status="<status>"` so Playwright can target a column by status
      without matching label text. Empty columns render a muted "Nothing
      here yet" line — important visual signal that the pipeline isn't
      broken, the status is just empty.
    - Drag-drop wiring lands in E3-S3. This component is a pure container.

  # Decision cast down
    - Rejected: stacking columns horizontally with a CSS grid of fixed
      widths. `flex` + `min-w-72` keeps things responsive at desktop sizes
      and lets us add a horizontal scroll wrapper at the page level.
-->
<script setup lang="ts">
import type { PropertyStatus } from '~~/shared/contracts/property'
import { PROPERTY_STATUS_LABEL } from '~~/shared/contracts/property'

const props = defineProps<{
  status: PropertyStatus
  count: number
}>()
</script>

<template>
  <section
    :data-testid="'pipeline-column'"
    :data-status="status"
    class="flex flex-col w-72 shrink-0 bg-surface-muted border border-border rounded-card"
  >
    <header class="flex items-center justify-between px-3 py-2 border-b border-border">
      <h2 class="text-caption font-semibold uppercase tracking-wide text-text-secondary">
        {{ PROPERTY_STATUS_LABEL[status] }}
      </h2>
      <span
        :data-testid="'pipeline-column-count'"
        class="text-caption text-text-secondary tabular-nums"
      >
        {{ count }}
      </span>
    </header>
    <div class="flex flex-col gap-2 p-2 overflow-y-auto min-h-24">
      <slot />
      <p
        v-if="count === 0"
        class="text-caption text-text-disabled text-center py-4"
        data-testid="pipeline-column-empty"
      >
        Nothing here yet
      </p>
    </div>
  </section>
</template>

<!--
  app/components/property/PipelineList.vue — flat list view of the pipeline
  (E3-S2). Groups rows by status with sticky section headers; each row reuses
  `PropertyCard`.

  # Decisions (ADR-0008)
    - Same data shape as the kanban (`Record<PropertyStatus, Property[]>`)
      and the same UX status order; only the layout changes. Avoids two
      sources of truth for "the pipeline."
    - Section headers are sticky so the active status stays visible while
      a long list scrolls — important for one-handed mobile use.
    - Empty status sections are *omitted* from the list (unlike the kanban,
      which shows every column). On mobile, scrolling past 13 mostly-empty
      headers is friction; the kanban already shows the full status set.

  # Decision cast down
    - Rejected: rendering `PropertyCard` inline with custom mobile styles.
      The card already truncates and pads correctly; the only thing the
      list adds is grouping + sticky headers.
-->
<script setup lang="ts">
import type { Property, PropertyStatus } from '~~/shared/contracts/property'
import { PROPERTY_STATUS_LABEL } from '~~/shared/contracts/property'

const props = defineProps<{
  groupedByStatus: Record<PropertyStatus, Property[]>
  columnOrder: PropertyStatus[]
}>()
defineEmits<{ 'change-status': [propertyId: string, status: PropertyStatus] }>()

const visibleSections = computed(() =>
  props.columnOrder
    .map((status) => ({ status, rows: props.groupedByStatus[status] }))
    .filter((s) => s.rows.length > 0),
)
</script>

<template>
  <div data-testid="pipeline-list" class="flex flex-col">
    <section
      v-for="section in visibleSections"
      :key="section.status"
      :data-testid="'pipeline-list-section'"
      :data-status="section.status"
    >
      <header
        class="sticky top-0 z-10 px-4 py-2 bg-surface-muted border-y border-border"
      >
        <div class="flex items-center justify-between">
          <h2
            class="text-caption font-semibold uppercase tracking-wide text-text-secondary"
          >
            {{ PROPERTY_STATUS_LABEL[section.status] }}
          </h2>
          <span class="text-caption text-text-secondary tabular-nums">
            {{ section.rows.length }}
          </span>
        </div>
      </header>
      <div class="flex flex-col gap-2 p-3">
        <PropertyCard
          v-for="row in section.rows"
          :key="row.id"
          :property="row"
          @change-status="(id, s) => $emit('change-status', id, s)"
        />
      </div>
    </section>
  </div>
</template>

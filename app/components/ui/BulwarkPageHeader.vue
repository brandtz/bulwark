<!--
  BulwarkPageHeader.vue — the page's title block (Packet A components/SPEC.md, WP-A3).

  Breadcrumbs (a Back link on phones), the page's only <h1>, then status badge,
  chips and a meta line; actions on the right (keep to two visible plus an
  overflow; the region is labelled), tabs underneath. Slots: actions, tabs.
-->
<script setup lang="ts">
import type { StatusHue } from '~~/shared/utils/status-hue'

interface Crumb { label: string, to?: string }
interface Chip { label: string, variant?: 'default' | 'accent', dot?: StatusHue | null }
interface Props {
  title: string
  breadcrumbs?: Crumb[]
  status?: { label: string, hue: StatusHue } | null
  chips?: Chip[]
  meta?: string
}
withDefaults(defineProps<Props>(), { breadcrumbs: () => [], status: null, chips: () => [], meta: '' })
const slots = useSlots()
</script>

<template>
  <header class="bw-pageh">
    <template v-if="breadcrumbs.length">
      <BulwarkBreadcrumbs class="hidden md:block" :items="breadcrumbs" />
      <BulwarkBreadcrumbs class="md:hidden" :items="breadcrumbs" back-only />
    </template>
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <h1>{{ title }}</h1>
        <div v-if="status || chips.length || meta" class="meta mt-2">
          <StatusBadge v-if="status" :hue="status.hue" :label="status.label" />
          <BulwarkChips v-for="c in chips" :key="c.label" :variant="c.variant ?? 'accent'" :dot="c.dot ?? null">{{ c.label }}</BulwarkChips>
          <span v-if="meta" class="text-sm" style="color: var(--text-secondary)">{{ meta }}</span>
        </div>
      </div>
      <div v-if="slots.actions" class="flex gap-2 flex-wrap" role="group" aria-label="Page actions">
        <slot name="actions" />
      </div>
    </div>
    <slot name="tabs" />
  </header>
</template>

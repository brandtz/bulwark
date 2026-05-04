<!--
  BulwarkJobCard.vue — property/work-order list card.

  Why this component exists
  -------------------------
  The Field dashboard, Subcontractor dashboard, Property pipeline, and
  Work Orders list all need the same one-line summary card: address,
  status pill, optional time/scope, optional action slot. This is the
  most-rendered domain primitive in the app — getting it consistent is
  the difference between "professional product" and "demo".

  Decisions
  ---------
  - **status uses StatusBadge directly** so any new status enum values
    show up here automatically.
  - **`actions` slot, not "actionButtons" prop**: gives consumers full
    control over button content/order.
-->
<script setup lang="ts">
import type { PropertyStatus } from '~~/shared/contracts/property'

interface Props {
  address: string
  status: PropertyStatus
  /** Optional ISO time or short string ("8:00 AM", "Today"). */
  time?: string
  /** Optional scope description ("Full retrofit · 12 items"). */
  scope?: string
  /** Optional client name shown on second line. */
  clientName?: string
  /** Wrap card in a link if provided. */
  to?: string
}
const props = withDefaults(defineProps<Props>(), {
  time: '',
  scope: '',
  clientName: '',
  to: undefined,
})

const Tag = computed(() => (props.to ? resolveComponent('NuxtLink') : 'div'))
</script>

<template>
  <component
    :is="Tag"
    :to="to"
    class="block rounded-card border border-border bg-surface p-4 shadow-card transition hover:shadow-md"
    :class="to && 'cursor-pointer'"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-body font-semibold text-text-primary truncate">{{ address }}</p>
        <p
          v-if="clientName || time"
          class="text-small text-text-secondary truncate mt-0.5"
        >
          <span v-if="clientName">{{ clientName }}</span>
          <span v-if="clientName && time" class="mx-1">·</span>
          <span v-if="time">{{ time }}</span>
        </p>
        <p v-if="scope" class="text-small text-text-secondary mt-1 truncate">
          {{ scope }}
        </p>
      </div>
      <StatusBadge :status="status" size="sm" />
    </div>
    <div v-if="$slots.actions" class="mt-3 flex gap-2 justify-end">
      <slot name="actions" />
    </div>
  </component>
</template>

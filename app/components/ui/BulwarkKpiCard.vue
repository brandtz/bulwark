<!--
  BulwarkKpiCard.vue — dashboard metric tile.

  Why this component exists
  -------------------------
  Field/Admin dashboards each have a row of metric tiles ("Active Jobs",
  "Compliance Pending", "Invoices Due"). Without a shared component
  each dashboard renders its own card and the typography/spacing drifts.
-->
<script setup lang="ts">
interface Props {
  label: string
  value: string | number
  /** Delta string e.g. "+12%". Omit when there's nothing to compare. */
  delta?: string
  deltaDirection?: 'up' | 'down' | 'flat'
  /** Optional link wraps the entire card. */
  to?: string
  tone?: 'default' | 'warning' | 'error'
}
const props = withDefaults(defineProps<Props>(), {
  delta: '',
  deltaDirection: 'flat',
  to: undefined,
  tone: 'default',
})

const toneClass = computed(() => ({
  default: 'border-border',
  warning: 'border-status-warning',
  error: 'border-status-error',
}[props.tone]))

const deltaToneClass = computed(() => ({
  up: 'text-status-success',
  down: 'text-status-error',
  flat: 'text-text-secondary',
}[props.deltaDirection]))

const Tag = computed(() => (props.to ? resolveComponent('NuxtLink') : 'div'))
</script>

<template>
  <component
    :is="Tag"
    :to="to"
    class="block rounded-card border bg-surface p-4 shadow-card transition hover:shadow-md"
    :class="[toneClass, to && 'cursor-pointer']"
  >
    <p class="text-small text-text-secondary">{{ label }}</p>
    <p class="text-h2 text-text-primary mt-1">{{ value }}</p>
    <p v-if="delta" class="text-small mt-1" :class="deltaToneClass">
      {{ delta }}
    </p>
  </component>
</template>

<!--
  BulwarkKpiCard.vue — one headline number (Packet A components/SPEC.md, WP-A2).

  `format` renders money (cents → $ with tabular numerals), int or percent.
  An empty value is an em dash plus `emptyReason`, never "$0.00". The delta is
  arrow + text (never arrow alone) and the value's aria-label includes it.
  `tone` adds a status rail. Slots: sparkline (aria-hidden), footer.
  Existing callers' string `delta` + `deltaDirection` and `to` still work.
-->
<script setup lang="ts">
type Direction = 'up' | 'down' | 'flat'
interface Delta { value: string; label?: string; direction: Direction }
interface Props {
  label: string
  value: string | number | null | undefined
  format?: 'money' | 'int' | 'percent'
  delta?: Delta | string
  /** @deprecated pass `delta` as an object. */
  deltaDirection?: Direction
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'default' | 'error'
  loading?: boolean
  emptyReason?: string
  to?: string
}
const props = withDefaults(defineProps<Props>(), {
  format: undefined,
  delta: undefined,
  deltaDirection: 'flat',
  tone: 'neutral',
  loading: false,
  emptyReason: '',
  to: undefined,
})

const isEmpty = computed(() => props.value === null || props.value === undefined || props.value === '')
const display = computed(() => {
  if (isEmpty.value) return '—'
  const v = props.value as string | number
  if (typeof v !== 'number') return v
  if (props.format === 'money') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v / 100)
  if (props.format === 'percent') return `${Math.round(v * 10) / 10}%`
  if (props.format === 'int') return new Intl.NumberFormat('en-US').format(Math.round(v))
  return String(v)
})
const deltaObj = computed<Delta | null>(() => {
  if (!props.delta) return null
  return typeof props.delta === 'string' ? { value: props.delta, direction: props.deltaDirection } : props.delta
})
const arrow = computed(() => ({ up: '▲', down: '▼', flat: '▬' }[deltaObj.value?.direction ?? 'flat']))
const deltaColor = computed(() => ({ up: 'var(--success-fg)', down: 'var(--danger-fg)', flat: 'var(--text-secondary)' }[deltaObj.value?.direction ?? 'flat']))
const rail = computed(() => {
  const t = props.tone === 'error' ? 'danger' : props.tone === 'default' ? 'neutral' : props.tone
  return t === 'neutral' ? null : `var(--${t}-fg)`
})
const ariaValue = computed(() => [display.value, deltaObj.value && `${deltaObj.value.direction === 'flat' ? 'unchanged' : deltaObj.value.direction} ${deltaObj.value.value}${deltaObj.value.label ? ` ${deltaObj.value.label}` : ''}`].filter(Boolean).join(', '))
const Tag = computed(() => (props.to ? resolveComponent('NuxtLink') : 'div'))
</script>

<template>
  <component
    :is="Tag"
    :to="to"
    class="bw-card block"
    :class="to && 'bw-card--clickable'"
    :style="rail ? { boxShadow: `inset 4px 0 0 ${rail}, var(--shadow-1)` } : undefined"
    :aria-busy="loading || undefined"
  >
    <p class="bw-help" style="font-size: var(--text-sm)">{{ label }}</p>
    <BulwarkSkeleton v-if="loading" :delay="0" class="mt-2" :lines="1" />
    <template v-else>
      <p
        class="tnum mt-1"
        style="font: 700 var(--text-3xl)/1.1 var(--font-display); color: var(--text-primary)"
        :aria-label="ariaValue"
      >{{ display }}</p>
      <p v-if="isEmpty && emptyReason" class="bw-help mt-1">{{ emptyReason }}</p>
      <p v-else-if="deltaObj" class="tnum mt-1" style="font-size: var(--text-sm)" :style="{ color: deltaColor }" aria-hidden="true">
        {{ arrow }} {{ deltaObj.value }}<span v-if="deltaObj.label" class="bw-help"> {{ deltaObj.label }}</span>
      </p>
    </template>
    <div v-if="$slots.sparkline" class="mt-2" aria-hidden="true"><slot name="sparkline" /></div>
    <div v-if="$slots.footer" class="mt-3"><slot name="footer" /></div>
  </component>
</template>

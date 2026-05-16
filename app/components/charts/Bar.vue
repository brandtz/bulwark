<!--
  components/charts/Bar.vue — vertical SVG bar chart for the W3-2 dashboard
  (EH-K / ADR-0030).

  # Decisions (ADR-0008)
    - Single SVG, one `<rect>` per bar, labels rendered as `<text>` so the
      chart stays one element + tooltips don't require JS.
    - Bars scale to the max value; empty data renders a placeholder line.
-->
<script setup lang="ts">
interface BarItem { label: string; value: number; color?: string }
const props = defineProps<{
  data: BarItem[]
  width?: number
  height?: number
  formatValue?: (v: number) => string
}>()

const width = computed(() => props.width ?? 480)
const height = computed(() => props.height ?? 160)
const PAD = { top: 12, right: 12, bottom: 28, left: 32 }

const max = computed(() => {
  const m = Math.max(0, ...props.data.map((d) => d.value))
  return m === 0 ? 1 : m
})
const innerWidth = computed(() => Math.max(40, width.value - PAD.left - PAD.right))
const innerHeight = computed(() => Math.max(40, height.value - PAD.top - PAD.bottom))
const barWidth = computed(() => {
  const n = Math.max(1, props.data.length)
  return Math.max(8, (innerWidth.value - 8 * (n - 1)) / n)
})

const fmt = (v: number) => (props.formatValue ? props.formatValue(v) : String(v))

function xFor(i: number): number {
  return PAD.left + i * (barWidth.value + 8)
}
function yFor(value: number): number {
  return PAD.top + innerHeight.value - (value / max.value) * innerHeight.value
}
function heightFor(value: number): number {
  return Math.max(0, (value / max.value) * innerHeight.value)
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    role="img"
    aria-label="bar chart"
    data-testid="bar-chart"
    class="max-w-full"
  >
    <line
      :x1="PAD.left"
      :y1="PAD.top + innerHeight"
      :x2="PAD.left + innerWidth"
      :y2="PAD.top + innerHeight"
      stroke="rgb(var(--color-border, 226 232 240))"
    />
    <template v-for="(d, i) in data" :key="d.label">
      <rect
        :x="xFor(i)"
        :y="yFor(d.value)"
        :width="barWidth"
        :height="heightFor(d.value)"
        :fill="d.color ?? 'rgb(var(--color-primary))'"
        :data-testid="`bar-${d.label}`"
      >
        <title>{{ d.label }}: {{ fmt(d.value) }}</title>
      </rect>
      <text
        :x="xFor(i) + barWidth / 2"
        :y="height - 12"
        text-anchor="middle"
        class="fill-text-secondary text-tiny"
      >
        {{ d.label }}
      </text>
      <text
        :x="xFor(i) + barWidth / 2"
        :y="yFor(d.value) - 4"
        text-anchor="middle"
        class="fill-text-primary text-tiny"
      >
        {{ fmt(d.value) }}
      </text>
    </template>
  </svg>
</template>

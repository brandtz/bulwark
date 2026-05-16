<!--
  components/charts/Sparkline.vue — hand-rolled SVG line chart for the
  W3-2 revenue trend (EH-K / ADR-0030).

  # Decisions (ADR-0008)
    - Single polyline; min/max overlays render only when the dataset is
      non-trivial. No tooltips at v1 \u2014 the dashboard cards adjacent to
      the sparkline carry the rollup numbers.
-->
<script setup lang="ts">
const props = defineProps<{
  data: number[]
  width?: number
  height?: number
}>()

const width = computed(() => props.width ?? 480)
const height = computed(() => props.height ?? 80)
const PAD = 6

const range = computed(() => {
  if (props.data.length === 0) return { min: 0, max: 1 }
  const min = Math.min(...props.data)
  const max = Math.max(...props.data)
  if (min === max) return { min: min - 1, max: max + 1 }
  return { min, max }
})

const points = computed(() => {
  if (props.data.length === 0) return ''
  const xStep = props.data.length === 1
    ? 0
    : (width.value - PAD * 2) / (props.data.length - 1)
  const yScale = (v: number) => {
    const { min, max } = range.value
    const t = (v - min) / (max - min)
    return height.value - PAD - t * (height.value - PAD * 2)
  }
  return props.data.map((v, i) => `${PAD + i * xStep},${yScale(v)}`).join(' ')
})

const empty = computed(() => props.data.length === 0)
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    role="img"
    aria-label="sparkline"
    data-testid="sparkline"
    class="max-w-full"
  >
    <line
      v-if="empty"
      :x1="PAD"
      :y1="height / 2"
      :x2="width - PAD"
      :y2="height / 2"
      stroke="rgb(var(--color-border, 226 232 240))"
      stroke-dasharray="4 4"
    />
    <polyline
      v-else
      :points="points"
      fill="none"
      stroke="rgb(var(--color-primary))"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
</template>

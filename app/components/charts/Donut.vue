<!--
  components/charts/Donut.vue — hand-rolled SVG donut for the W3-2 dashboard
  (EH-K / ADR-0030).

  # Decisions (ADR-0008, ADR-0030)
    - No chart library. Pure SVG arcs computed inline. The math is tiny
      (one arc per segment, cumulative-angle accumulator) so a dependency
      buys nothing — and the ADR makes "zero new deps" a hard constraint.
    - Each segment is its own `<path>` with `data-testid="donut-segment-<label>"`
      so Playwright can assert specific slices when a future test needs to.
    - Empty data renders a neutral ring (the dashboard's empty-state copy
      sits adjacent to the chart, not inside it).
-->
<script setup lang="ts">
interface Slice { label: string; value: number; color?: string }
const props = defineProps<{
  data: Slice[]
  size?: number
  thickness?: number
}>()

const size = computed(() => props.size ?? 160)
const thickness = computed(() => props.thickness ?? 24)
const radius = computed(() => size.value / 2)
const inner = computed(() => radius.value - thickness.value)
const total = computed(() => props.data.reduce((s, d) => s + Math.max(0, d.value), 0))

const PALETTE = [
  'rgb(var(--color-primary))',
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
]

function polar(angle: number, r: number, cx: number, cy: number) {
  const rad = (angle - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

const segments = computed(() => {
  if (total.value <= 0) return []
  const cx = radius.value
  const cy = radius.value
  let cursor = 0
  return props.data
    .filter((d) => d.value > 0)
    .map((d, i) => {
      const portion = d.value / total.value
      const startAngle = cursor * 360
      cursor += portion
      const endAngle = cursor * 360
      const sweep = endAngle - startAngle
      const largeArc = sweep > 180 ? 1 : 0
      const s1 = polar(startAngle, radius.value, cx, cy)
      const e1 = polar(endAngle, radius.value, cx, cy)
      const s2 = polar(endAngle, inner.value, cx, cy)
      const e2 = polar(startAngle, inner.value, cx, cy)
      const path = [
        `M ${s1.x} ${s1.y}`,
        `A ${radius.value} ${radius.value} 0 ${largeArc} 1 ${e1.x} ${e1.y}`,
        `L ${s2.x} ${s2.y}`,
        `A ${inner.value} ${inner.value} 0 ${largeArc} 0 ${e2.x} ${e2.y}`,
        'Z',
      ].join(' ')
      return {
        label: d.label,
        value: d.value,
        path,
        color: d.color ?? PALETTE[i % PALETTE.length],
      }
    })
})
</script>

<template>
  <div class="flex items-center gap-4" data-testid="donut-chart">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" role="img" aria-label="donut chart">
      <circle
        :cx="radius"
        :cy="radius"
        :r="(radius + inner) / 2"
        fill="none"
        stroke="rgb(var(--color-surface-muted, 226 232 240))"
        :stroke-width="thickness"
      />
      <path
        v-for="seg in segments"
        :key="seg.label"
        :d="seg.path"
        :fill="seg.color"
        :data-testid="`donut-segment-${seg.label}`"
      />
      <text
        :x="radius"
        :y="radius"
        text-anchor="middle"
        dominant-baseline="central"
        class="text-small fill-text-primary font-medium"
      >
        {{ total }}
      </text>
    </svg>
    <ul class="space-y-1 text-small">
      <li
        v-for="seg in segments"
        :key="seg.label"
        class="flex items-center gap-2"
        :data-testid="`donut-legend-${seg.label}`"
      >
        <span :style="{ backgroundColor: seg.color }" class="inline-block w-3 h-3 rounded-sm" />
        <span class="text-text-primary">{{ seg.label }}</span>
        <span class="text-text-secondary">{{ seg.value }}</span>
      </li>
      <li v-if="segments.length === 0" class="text-text-secondary">No data.</li>
    </ul>
  </div>
</template>

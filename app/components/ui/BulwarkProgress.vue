<!--
  BulwarkProgress.vue — determinate or indeterminate progress (Packet A
  components/SPEC.md, WP-A3). role=progressbar with aria-valuenow (omitted when
  indeterminate); the label stays visible. Linear bar or ring (size px).
-->
<script setup lang="ts">
interface Props {
  value?: number | null
  variant?: 'linear' | 'ring'
  label: string
  size?: number
}
const props = withDefaults(defineProps<Props>(), { value: null, variant: 'linear', size: 48 })
const pct = computed(() => (props.value === null ? null : Math.max(0, Math.min(100, props.value))))
const r = computed(() => props.size / 2 - 4)
const circ = computed(() => 2 * Math.PI * r.value)
</script>

<template>
  <div
    class="flex items-center gap-3"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="pct ?? undefined"
    :aria-busy="pct === null || undefined"
  >
    <template v-if="variant === 'ring'">
      <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true" :class="pct === null && 'animate-spin'">
        <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="var(--bg-sunken)" stroke-width="4" />
        <circle
          :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"
          :stroke-dasharray="circ" :stroke-dashoffset="pct === null ? circ * 0.7 : circ * (1 - pct / 100)"
          :transform="`rotate(-90 ${size / 2} ${size / 2})`"
        />
      </svg>
    </template>
    <div v-else class="bw-progress flex-1" aria-hidden="true">
      <span :style="pct === null ? 'width: 35%; animation: bw-indeterminate 1.2s ease-in-out infinite' : { width: `${pct}%` }" />
    </div>
    <span class="bw-help tnum shrink-0">{{ label }}<template v-if="pct !== null"> · {{ Math.round(pct) }}%</template></span>
  </div>
</template>

<style>
@keyframes bw-indeterminate { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } }
</style>

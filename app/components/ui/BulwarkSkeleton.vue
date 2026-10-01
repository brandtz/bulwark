<!--
  BulwarkSkeleton.vue — loading placeholder (Packet A components/SPEC.md, WP-A2).

  Kinds: text (lines), avatar, card, table (rows × columns), kanban, calendar;
  match the final layout so nothing jumps when data lands. The shimmer is
  aria-hidden; the container is aria-busy and announces "Loading" once.
  SPEC: appear after 300ms, so fast loads never flash a skeleton.
  `variant` / `heightClass` (existing callers) still work.
-->
<script setup lang="ts">
interface Props {
  kind?: 'text' | 'avatar' | 'card' | 'table' | 'kanban' | 'calendar'
  lines?: number
  rows?: number
  columns?: number
  /** Delay before showing, ms (SPEC 300). */
  delay?: number
  /** @deprecated use `kind`; 'rect' = a block sized by `heightClass`. */
  variant?: 'text' | 'card' | 'avatar' | 'rect'
  /** @deprecated */
  heightClass?: string
}
const props = withDefaults(defineProps<Props>(), {
  kind: undefined,
  lines: 1,
  rows: 5,
  columns: 4,
  delay: 300,
  variant: undefined,
  heightClass: '',
})

const resolved = computed(() => props.kind ?? (props.variant === 'rect' ? 'rect' : props.variant) ?? 'text')
const visible = ref(props.delay === 0)
let timer: ReturnType<typeof setTimeout> | undefined
onMounted(() => { if (!visible.value) timer = setTimeout(() => { visible.value = true }, props.delay) })
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div aria-busy="true">
    <span class="sr-only" role="status">Loading</span>
    <div v-if="visible" aria-hidden="true">
      <template v-if="resolved === 'text'">
        <span
          v-for="i in lines"
          :key="i"
          class="bw-skel"
          :style="{ height: '14px', width: i === lines && lines > 1 ? '75%' : '100%', marginTop: i > 1 ? '8px' : '0' }"
        />
      </template>
      <span v-else-if="resolved === 'avatar'" class="bw-skel" style="width: 32px; height: 32px; border-radius: 50%" />
      <span v-else-if="resolved === 'card'" class="bw-skel" style="height: 128px; border-radius: var(--radius-lg)" />
      <div v-else-if="resolved === 'table'" class="flex flex-col gap-3" data-testid="bulwark-table-skeleton">
        <div
          v-for="r in rows + 1"
          :key="r"
          class="grid gap-3"
          :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
          :data-testid="r === 1 ? 'bulwark-table-skeleton-header' : 'bulwark-table-skeleton-row'"
        >
          <span v-for="c in columns" :key="c" class="bw-skel" :style="{ height: r === 1 ? '12px' : '16px', opacity: r === 1 ? 0.7 : 1 }" />
        </div>
      </div>
      <div v-else-if="resolved === 'kanban'" class="grid gap-4" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(220px, 1fr))` }">
        <div v-for="c in columns" :key="c" class="flex flex-col gap-3">
          <span class="bw-skel" style="height: 16px; width: 60%" />
          <span v-for="r in Math.max(1, rows - c % 2)" :key="r" class="bw-skel" style="height: 88px; border-radius: var(--radius-lg)" />
        </div>
      </div>
      <div v-else-if="resolved === 'calendar'" class="grid grid-cols-7 gap-2">
        <span v-for="d in 35" :key="d" class="bw-skel" style="height: 64px" />
      </div>
      <span v-else class="bw-skel" :class="heightClass || 'h-24'" />
    </div>
  </div>
</template>

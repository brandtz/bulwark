<!--
  BulwarkBottomSheet.vue — phone sheet (Packet A components/SPEC.md, WP-A3).

  role=dialog with a focus trap; Esc, the overlay or a downward swipe (> 80px)
  closes. The drag handle is decorative. Heights: auto, half, full.
-->
<script setup lang="ts">
interface Props {
  open: boolean
  title: string
  height?: 'auto' | 'half' | 'full'
}
const props = withDefaults(defineProps<Props>(), { height: 'auto' })
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
const titleId = useId()
useFocusTrap(() => props.open, panel)

let startY: number | null = null
const offset = ref(0)
function onTouchStart(e: TouchEvent) { startY = e.touches[0]?.clientY ?? null }
function onTouchMove(e: TouchEvent) { if (startY !== null) offset.value = Math.max(0, (e.touches[0]?.clientY ?? startY) - startY) }
function onTouchEnd() {
  if (offset.value > 80) emit('close')
  offset.value = 0
  startY = null
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
watch(() => props.open, (o) => {
  if (typeof document === 'undefined') return
  if (o) document.addEventListener('keydown', onKey)
  else document.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => { if (typeof document !== 'undefined') document.removeEventListener('keydown', onKey) })
const maxH = computed(() => ({ auto: '90vh', half: '50vh', full: '100vh' }[props.height]))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 flex items-end" style="z-index: var(--z-modal); background: var(--overlay)" @click.self="emit('close')">
      <div
        ref="panel"
        class="bw-sheet overflow-auto focus:outline-none"
        :style="{ maxHeight: maxH, height: height === 'auto' ? 'auto' : maxH, transform: offset ? `translateY(${offset}px)` : undefined }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @touchstart.passive="onTouchStart"
        @touchmove.passive="onTouchMove"
        @touchend="onTouchEnd"
      >
        <h2 :id="titleId" class="px-1 pb-2" style="margin: 0; font: 700 var(--text-lg) var(--font-display)">{{ title }}</h2>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

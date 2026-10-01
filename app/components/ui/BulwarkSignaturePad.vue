<!--
  BulwarkSignaturePad.vue — drawn signature (Packet A components/SPEC.md, WP-A2).

  The single signature pad (WP-A2 removed the duplicate compliance/SignaturePad).
  Pointer events draw on a DPR-sized canvas; each finished stroke commits the
  PNG data URL (v-model) and `v-model:is-empty` reflects whether anything is
  drawn. `locked` (after submit) freezes it and hides Clear. The canvas is
  role=img with an accessible name; the keyboard alternative is typing the
  name (BulwarkSignatureBlock, WP-A4), so the pad is not the only way to sign.
  `statement` is the certification line shown beside Clear.
-->
<script setup lang="ts">
interface Props {
  /** PNG data URL; '' when empty. */
  modelValue: string
  /** Frozen after submit (SPEC). */
  locked?: boolean
  /** @deprecated use `locked`. */
  disabled?: boolean
  /** Display height in CSS px. */
  height?: number
  placeholder?: string
  /** Certification line shown beside Clear. */
  statement?: string
  label?: string
  strokeStyle?: string
  lineWidth?: number
}
const props = withDefaults(defineProps<Props>(), {
  locked: false,
  disabled: false,
  height: 140,
  placeholder: 'Sign here',
  statement: '',
  label: 'Signature',
  strokeStyle: '#0f172a',
  lineWidth: 2.2,
})
const emit = defineEmits<{
  'update:modelValue': [v: string]
  'update:isEmpty': [v: boolean]
  clear: []
}>()

const frozen = computed(() => props.locked || props.disabled)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const isEmpty = ref(!props.modelValue)
let lastPoint: { x: number, y: number } | null = null

function ctx(): CanvasRenderingContext2D | null {
  return canvasRef.value?.getContext('2d') ?? null
}

function resizeBackingStore() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  const c = canvas.getContext('2d')
  if (!c) return
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.strokeStyle = props.strokeStyle
  c.lineWidth = props.lineWidth
}

function pointerPos(e: PointerEvent): { x: number, y: number } {
  const rect = canvasRef.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function onPointerDown(e: PointerEvent) {
  if (frozen.value) return
  const canvas = canvasRef.value
  const c = ctx()
  if (!canvas || !c) return
  isDrawing.value = true
  // Synthesized pointer events (tests) may not support capture; it is optional.
  try { canvas.setPointerCapture(e.pointerId) } catch { /* see note */ }
  const p = pointerPos(e)
  lastPoint = p
  c.beginPath() // a tap with no movement still leaves a dot
  c.arc(p.x, p.y, props.lineWidth / 2, 0, Math.PI * 2)
  c.fillStyle = props.strokeStyle
  c.fill()
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!isDrawing.value || frozen.value) return
  const c = ctx()
  if (!c || !lastPoint) return
  const p = pointerPos(e)
  c.beginPath()
  c.moveTo(lastPoint.x, lastPoint.y)
  c.lineTo(p.x, p.y)
  c.stroke()
  lastPoint = p
  e.preventDefault()
}

function commit() {
  const canvas = canvasRef.value
  if (!canvas) return
  if (isEmpty.value) {
    isEmpty.value = false
    emit('update:isEmpty', false)
  }
  emit('update:modelValue', canvas.toDataURL('image/png'))
}

function onPointerUp(e: PointerEvent) {
  if (!isDrawing.value) return
  isDrawing.value = false
  lastPoint = null
  const canvas = canvasRef.value
  if (canvas?.hasPointerCapture(e.pointerId)) {
    try { canvas.releasePointerCapture(e.pointerId) } catch { /* see note */ }
  }
  commit()
}

function clear() {
  const canvas = canvasRef.value
  const c = ctx()
  if (!canvas || !c) return
  const rect = canvas.getBoundingClientRect()
  c.clearRect(0, 0, rect.width, rect.height)
  isEmpty.value = true
  lastPoint = null
  emit('update:modelValue', '')
  emit('update:isEmpty', true)
  emit('clear')
}

defineExpose({ clear })

onMounted(() => {
  resizeBackingStore()
  emit('update:isEmpty', isEmpty.value)
})
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="signature-pad">
    <div
      class="relative"
      style="border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: #fff"
      :style="{ height: `${height}px`, opacity: frozen ? 0.7 : 1 }"
    >
      <canvas
        ref="canvasRef"
        role="img"
        :aria-label="isEmpty ? `${label}: empty` : `${label}: signed`"
        class="block h-full w-full touch-none"
        :style="{ cursor: frozen ? 'not-allowed' : 'crosshair', borderRadius: 'var(--radius-sm)' }"
        data-testid="signature-pad-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerUp"
      />
      <span
        v-if="isEmpty"
        class="pointer-events-none absolute inset-0 flex items-center justify-center"
        style="color: #8C96A3; font-size: var(--text-md)"
      >
        {{ placeholder }}
      </span>
    </div>
    <div class="flex items-center justify-between gap-3">
      <span class="bw-help">{{ statement }}</span>
      <button
        v-if="!locked"
        type="button"
        class="bw-btn bw-btn--link"
        :disabled="isEmpty || frozen"
        data-testid="signature-pad-clear"
        @click="clear"
      >
        Clear
      </button>
    </div>
  </div>
</template>

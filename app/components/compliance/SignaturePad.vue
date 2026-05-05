<!--
  SignaturePad.vue — canvas-based signature capture (E7-S2).

  # Decisions (ADR-0008)
    - Pointer events (pointerdown/pointermove/pointerup/pointercancel/leave)
      so the same handler covers mouse, touch, and pen with one code path.
      The mobile field crew is the primary user; touch must work first.
    - Drawing model: track `lastPoint` and `lineTo()` between move samples
      to avoid the dotty look of plotting raw points. `lineCap='round'` +
      `lineJoin='round'` for a marker-pen feel.
    - We export the captured PNG as a data URL via `update:modelValue`
      whenever the pointer lifts, plus an `update:isEmpty` flag so the
      parent form can disable submit when nothing is drawn.
    - The canvas backing store is sized via DPR for crisp lines on
      retina screens. On `resize`, we redraw cached strokes so the user
      doesn't lose work. (v1: simple — we just clear and ask the user
      to re-sign on dramatic resize. Field tablets don't rotate often.)
    - We expose `clear()` via `defineExpose` so the parent's "Clear"
      button can wipe state without piping another v-model.

  # Decision cast down
    - Rejected: SVG path-based capture. PNG round-trips through R2 in
      E11 with no extra plumbing; SVG would force us to render-to-PNG
      server-side anyway.
    - Rejected: bezier smoothing (e.g. Catmull-Rom). The visual win is
      tiny at the resolution we capture and the code adds a meaningful
      maintenance burden. Revisit if a sponsor calls it out.
-->
<script setup lang="ts">
interface Props {
  /** Captured PNG data URL, '' when empty. */
  modelValue: string
  /** Display height (CSS px). Backing store scales by DPR. */
  height?: number
  /** Stroke colour. */
  strokeStyle?: string
  /** Stroke width in CSS px. */
  lineWidth?: number
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  height: 180,
  strokeStyle: '#0f172a',
  lineWidth: 2.2,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'update:isEmpty', v: boolean): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const isEmpty = ref(true)
let lastPoint: { x: number; y: number } | null = null

function ctx(): CanvasRenderingContext2D | null {
  const c = canvasRef.value
  if (!c) return null
  return c.getContext('2d')
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

function pointerPos(e: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled) return
  const canvas = canvasRef.value
  const c = ctx()
  if (!canvas || !c) return
  isDrawing.value = true
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    // Synthesized pointer events (tests / programmatic dispatch) may
    // not register with the browser pointer-capture machinery; the
    // capture is a nice-to-have, not a correctness requirement.
  }
  const p = pointerPos(e)
  lastPoint = p
  // Tap (no movement) should still leave a dot.
  c.beginPath()
  c.arc(p.x, p.y, props.lineWidth / 2, 0, Math.PI * 2)
  c.fillStyle = props.strokeStyle
  c.fill()
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!isDrawing.value || props.disabled) return
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
  const dataUrl = canvas.toDataURL('image/png')
  if (isEmpty.value) {
    isEmpty.value = false
    emit('update:isEmpty', false)
  }
  emit('update:modelValue', dataUrl)
}

function onPointerUp(e: PointerEvent) {
  if (!isDrawing.value) return
  isDrawing.value = false
  lastPoint = null
  const canvas = canvasRef.value
  if (canvas?.hasPointerCapture(e.pointerId)) {
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      // See onPointerDown — same defensive note.
    }
  }
  commit()
}

function clear() {
  const canvas = canvasRef.value
  const c = ctx()
  if (!canvas || !c) return
  // setTransform was scaled by DPR; clearRect uses CSS pixels under that
  // transform, which is what we want.
  const rect = canvas.getBoundingClientRect()
  c.clearRect(0, 0, rect.width, rect.height)
  isEmpty.value = true
  lastPoint = null
  emit('update:modelValue', '')
  emit('update:isEmpty', true)
}

defineExpose({ clear })

onMounted(() => {
  resizeBackingStore()
  // Reflect initial empty state up.
  emit('update:isEmpty', true)
})
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="signature-pad">
    <div
      class="relative rounded-input border border-border-strong bg-surface-base"
      :class="{ 'opacity-60': props.disabled }"
      :style="{ height: `${props.height}px` }"
    >
      <canvas
        ref="canvasRef"
        class="block h-full w-full touch-none rounded-input"
        :class="props.disabled ? 'cursor-not-allowed' : 'cursor-crosshair'"
        data-testid="signature-pad-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerUp"
      />
      <span
        v-if="isEmpty"
        class="pointer-events-none absolute inset-0 flex items-center justify-center text-body text-text-disabled"
      >
        Sign here
      </span>
    </div>
    <div class="flex items-center justify-between text-body-sm text-text-secondary">
      <span>By signing you certify the work is complete and compliant.</span>
      <button
        type="button"
        class="font-medium text-primary hover:text-primary-700 disabled:text-text-disabled"
        :disabled="isEmpty || props.disabled"
        data-testid="signature-pad-clear"
        @click="clear"
      >
        Clear
      </button>
    </div>
  </div>
</template>

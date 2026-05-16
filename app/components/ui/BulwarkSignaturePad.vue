<!--
  BulwarkSignaturePad.vue — canvas-based signature primitive (W2-6 / EH-L).

  # Why this component exists
  --------------------------
  Two surfaces already capture signatures (compliance/SignaturePad.vue and
  the inspection submit modal). Both rolled their own. EH-L promotes the
  primitive into `ui/` so future signature surfaces (sub acceptance,
  homeowner approval, change-order sign-off) share one accessible,
  touch-correct implementation.

  # Decisions (ADR-0008 / ADR-0026)
    - **Native canvas + pointer events**: covers mouse, touch, and pen
      with one code path. No `signature_pad` npm dep — see W2-6 hard
      constraint ("DO NOT add new dep packages").
    - **Two-way v-model with commit-on-Save**: unlike the legacy
      compliance/SignaturePad that emitted on every pointerup, the
      "Save" button is explicit so the parent form knows when the user
      considers the signature final. "Clear" zeroes the buffer and
      emits an empty string so a parent can re-disable submit.
    - **DPR-aware backing store**: scaled by `devicePixelRatio` so the
      stroke stays crisp on retina tablets. `setTransform(dpr, ...)`
      lets the rest of the math stay in CSS pixels.
    - **`role="img"` + `aria-label="Signature canvas"`**: an empty
      canvas with no children is invisible to assistive tech otherwise.
      `tabindex="0"` makes it keyboard-focusable so the focus-visible
      ring lands on it as well.
    - **Imperative API exposed**: `defineExpose({ clear, save })` so
      parent forms can drive the pad from their own submit/cancel
      buttons without piping additional model values.

  # Decisions NOT taken
    - **No SVG path capture** — see compliance/SignaturePad rationale.
      PNG round-trips through storage with zero plumbing.
    - **No bezier smoothing** — visual win is marginal vs. maintenance.
    - **No undo stack** — UX call: "Clear" is the single rewind. A
      sponsor ask can layer stroke history later.

  # Compat shim
    - The pre-existing `app/components/compliance/SignaturePad.vue`
      remains and its consumers are NOT migrated in this slice (it has
      its own e2e selectors + `update:isEmpty` semantics that the
      compliance generator relies on). That migration is deferred to
      a follow-up (see ADR-0026 §"Deferred"). This file is the new
      canonical primitive for any NEW surface.
-->
<script setup lang="ts">
interface Props {
  /** Captured PNG data URL, '' when empty / cleared. */
  modelValue: string
  /** Disable interaction. */
  disabled?: boolean
  /** Hint shown when canvas is empty. */
  placeholder?: string
  /** Display height in CSS px. */
  height?: number
  /** Stroke color (CSS). */
  strokeStyle?: string
  /** Stroke width in CSS px. */
  lineWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  placeholder: 'Sign here',
  height: 180,
  strokeStyle: '#0f172a',
  lineWidth: 2.2,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'save', v: string): void
  (e: 'clear'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const isEmpty = ref(true)
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
  try { canvas.setPointerCapture(e.pointerId) } catch { /* synthesized events */ }
  const p = pointerPos(e)
  lastPoint = p
  c.beginPath()
  c.arc(p.x, p.y, props.lineWidth / 2, 0, Math.PI * 2)
  c.fillStyle = props.strokeStyle
  c.fill()
  isEmpty.value = false
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

function onPointerUp(e: PointerEvent) {
  if (!isDrawing.value) return
  isDrawing.value = false
  lastPoint = null
  const canvas = canvasRef.value
  if (canvas?.hasPointerCapture(e.pointerId)) {
    try { canvas.releasePointerCapture(e.pointerId) } catch { /* synthesized */ }
  }
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
  emit('clear')
}

function save() {
  const canvas = canvasRef.value
  if (!canvas || isEmpty.value) return
  const dataUrl = canvas.toDataURL('image/png')
  emit('update:modelValue', dataUrl)
  emit('save', dataUrl)
}

defineExpose({ clear, save })

onMounted(() => {
  resizeBackingStore()
})
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="bulwark-signature-pad">
    <div
      class="relative rounded-input border border-border-strong bg-surface-base"
      :class="{ 'opacity-60': props.disabled }"
      :style="{ height: `${props.height}px` }"
    >
      <canvas
        ref="canvasRef"
        tabindex="0"
        role="img"
        aria-label="Signature canvas"
        class="block h-full w-full touch-none rounded-input focus:outline-none"
        :class="props.disabled ? 'cursor-not-allowed' : 'cursor-crosshair'"
        data-testid="bulwark-signature-pad-canvas"
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
        {{ placeholder }}
      </span>
    </div>
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="rounded-input border border-border px-3 py-1.5 text-small text-text-primary hover:bg-surface-muted disabled:opacity-50"
        :disabled="isEmpty || props.disabled"
        data-testid="bulwark-signature-pad-clear"
        @click="clear"
      >
        Clear
      </button>
      <button
        type="button"
        class="rounded-input bg-primary px-3 py-1.5 text-small font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        :disabled="isEmpty || props.disabled"
        data-testid="bulwark-signature-pad-save"
        @click="save"
      >
        Save
      </button>
    </div>
  </div>
</template>

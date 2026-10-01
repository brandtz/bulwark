<!--
  BulwarkStepper.vue — two SPEC variants (Packet A components/SPEC.md, WP-A2).

    - display (default): wizard progress. An <ol>; the current step has
      aria-current="step"; done steps show a check and say "completed" to
      screen readers. Steps take `state` (SPEC) or `status` (existing).
    - input: numeric stepper (quantities). role=spinbutton with
      aria-valuenow/min/max; ↑/↓ (and PageUp/PageDown ×10) change the value;
      the − / + buttons are touch-sized via --control-h.
  Display-only: the consumer decides which step is current and routes.
-->
<script setup lang="ts">
type State = 'complete' | 'current' | 'upcoming' | 'error'
interface Step { label: string; state?: State; status?: State }

interface Props {
  variant?: 'display' | 'input'
  steps?: Step[]
  modelValue?: number
  min?: number
  max?: number
  step?: number
  label?: string
}
const props = withDefaults(defineProps<Props>(), {
  variant: 'display',
  steps: () => [],
  modelValue: 0,
  min: Number.NEGATIVE_INFINITY,
  max: Number.POSITIVE_INFINITY,
  step: 1,
  label: 'Quantity',
})
const emit = defineEmits<{ 'update:modelValue': [v: number] }>()

const stateOf = (s: Step): State => s.state ?? s.status ?? 'upcoming'
const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v))

function set(v: number) {
  const next = clamp(Math.round(v / props.step) * props.step)
  if (next !== props.modelValue) emit('update:modelValue', next)
}

function onKey(e: KeyboardEvent) {
  const delta = e.key === 'ArrowUp' ? props.step : e.key === 'ArrowDown' ? -props.step
    : e.key === 'PageUp' ? props.step * 10 : e.key === 'PageDown' ? -props.step * 10 : 0
  if (e.key === 'Home' && Number.isFinite(props.min)) { e.preventDefault(); set(props.min); return }
  if (e.key === 'End' && Number.isFinite(props.max)) { e.preventDefault(); set(props.max); return }
  if (!delta) return
  e.preventDefault()
  set(props.modelValue + delta)
}

function onInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) set(v)
}
</script>

<template>
  <div v-if="variant === 'input'" class="bw-stepper" role="group" :aria-label="label">
    <button type="button" :disabled="modelValue <= min" :aria-label="`Decrease ${label}`" @click="set(modelValue - step)">−</button>
    <input
      type="text"
      inputmode="numeric"
      role="spinbutton"
      :aria-label="label"
      :aria-valuenow="modelValue"
      :aria-valuemin="Number.isFinite(min) ? min : undefined"
      :aria-valuemax="Number.isFinite(max) ? max : undefined"
      :value="modelValue"
      @keydown="onKey"
      @change="onInput"
    >
    <button type="button" :disabled="modelValue >= max" :aria-label="`Increase ${label}`" @click="set(modelValue + step)">+</button>
  </div>

  <ol v-else class="bw-steps w-full" aria-label="Progress">
    <li
      v-for="(s, idx) in steps"
      :key="s.label"
      class="s min-w-0"
      :class="{ done: stateOf(s) === 'complete', cur: stateOf(s) === 'current' }"
      :aria-current="stateOf(s) === 'current' ? 'step' : undefined"
    >
      <span class="n" :style="stateOf(s) === 'error' ? 'border-color: var(--danger-fg); color: var(--danger-fg)' : undefined" aria-hidden="true">
        <BulwarkIcon v-if="stateOf(s) === 'complete'" name="check" size="sm" />
        <template v-else-if="stateOf(s) === 'error'">!</template>
        <template v-else>{{ idx + 1 }}</template>
      </span>
      <span class="truncate">
        {{ s.label }}<span class="sr-only">{{ stateOf(s) === 'complete' ? ', completed' : stateOf(s) === 'error' ? ', has an error' : '' }}</span>
      </span>
      <span v-if="idx < steps.length - 1" class="ln" aria-hidden="true" />
    </li>
  </ol>
</template>

<style>
.bw-stepper button:disabled { opacity: .4; cursor: not-allowed; }
[data-theme="dark"] .bw-steps .done .n { color: var(--neutral-950); }
@media (prefers-color-scheme: dark) { [data-theme="system"] .bw-steps .done .n { color: var(--neutral-950); } }
</style>

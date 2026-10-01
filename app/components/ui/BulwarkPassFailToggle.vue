<!--
  BulwarkPassFailToggle.vue — inspection item result (Packet A components/SPEC.md, WP-A2).

  radiogroup of Pass / Fail / N/A, each 48×72 minimum with icon + text (never
  colour alone). Arrow keys move and select (roving tabindex); choosing the
  selected option again clears it. `requirePhotoOnFail` prompts for a photo
  when Fail is chosen. Always three options unless the template hides N/A
  (`allowNa`). Dark theme uses dark ink on the light pass/fail fills (white
  on them is under 3:1).
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

type Tri = 'pass' | 'fail' | 'na' | null
interface Props {
  modelValue: Tri
  label: string
  description?: string
  allowNa?: boolean
  requirePhotoOnFail?: boolean
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  description: '',
  allowNa: true,
  requirePhotoOnFail: false,
  disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [v: Tri] }>()

const uid = useId()
const options = computed(() => {
  const base: Array<{ v: Exclude<Tri, null>, label: string, icon: IconName }> = [
    { v: 'pass', label: 'Pass', icon: 'check' },
    { v: 'fail', label: 'Fail', icon: 'x' },
  ]
  if (props.allowNa) base.push({ v: 'na', label: 'N/A', icon: 'minus' })
  return base
})
const buttons = ref<HTMLButtonElement[]>([])
const focusIndex = computed(() => Math.max(0, options.value.findIndex((o) => o.v === props.modelValue)))

function pick(v: Exclude<Tri, null>) {
  if (props.disabled) return
  emit('update:modelValue', props.modelValue === v ? null : v)
}

function onKey(e: KeyboardEvent, i: number) {
  const n = options.value.length
  const next = ['ArrowRight', 'ArrowDown'].includes(e.key) ? (i + 1) % n
    : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? (i - 1 + n) % n : -1
  if (next < 0 || props.disabled) return
  e.preventDefault()
  emit('update:modelValue', options.value[next]!.v)
  buttons.value[next]?.focus()
}
</script>

<template>
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div class="min-w-0 flex-1">
      <p :id="`${uid}-label`" style="font-size: var(--text-md); color: var(--text-primary)">{{ label }}</p>
      <p v-if="description" class="bw-help mt-0.5">{{ description }}</p>
    </div>
    <div class="flex flex-col items-end gap-1">
      <div
        class="bw-pf"
        :style="{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }"
        role="radiogroup"
        :aria-labelledby="`${uid}-label`"
      >
        <button
          v-for="(opt, i) in options"
          :key="opt.v"
          :ref="(el) => { if (el) buttons[i] = el as HTMLButtonElement }"
          type="button"
          role="radio"
          :class="[opt.v, { 'is-on': modelValue === opt.v }]"
          :aria-checked="modelValue === opt.v"
          :tabindex="i === focusIndex ? 0 : -1"
          :disabled="disabled"
          @click="pick(opt.v)"
          @keydown="onKey($event, i)"
        >
          <BulwarkIcon :name="opt.icon" size="sm" />{{ opt.label }}
        </button>
      </div>
      <p v-if="requirePhotoOnFail && modelValue === 'fail'" class="bw-help" role="status">
        Add a photo of the failure.
      </p>
    </div>
  </div>
</template>

<style>
[data-theme="dark"] .bw-pf .is-on.pass,
[data-theme="dark"] .bw-pf .is-on.fail { color: var(--neutral-950); }
@media (prefers-color-scheme: dark) {
  [data-theme="system"] .bw-pf .is-on.pass,
  [data-theme="system"] .bw-pf .is-on.fail { color: var(--neutral-950); }
}
.bw-pf button:disabled { opacity: .5; cursor: not-allowed; }
</style>

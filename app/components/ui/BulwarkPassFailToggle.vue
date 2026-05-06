<!--
  BulwarkPassFailToggle.vue — assessment pass/fail/n-a tri-state.

  Why this component exists
  -------------------------
  The Property Assessment Form (Epic E5) has dozens of compliance
  checklist items. Each is "Pass / Fail / N/A". The demo's wireframe
  uses a 3-button segmented control. This is the canonical control for
  that pattern across the entire app.

  Decisions
  ---------
  - **`null` modelValue** = "not yet evaluated", visually neutral. We
    require explicit selection at submit time at the form level (not here)
    so this primitive stays dumb.
  - **`allowNa` flag**: some checklist items (e.g. "photographed") don't
    accept N/A.
-->
<script setup lang="ts">
type Tri = 'pass' | 'fail' | 'na' | null

interface Props {
  modelValue: Tri
  label: string
  description?: string
  allowNa?: boolean
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  description: '',
  allowNa: true,
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [v: Tri] }>()

const buttons = computed(() => {
  const base: Array<{ v: 'pass' | 'fail' | 'na'; label: string; activeClass: string }> = [
    { v: 'pass', label: 'Pass', activeClass: 'bg-status-success border-status-success text-white' },
    { v: 'fail', label: 'Fail', activeClass: 'bg-status-error border-status-error text-white' },
  ]
  if (props.allowNa) base.push({ v: 'na', label: 'N/A', activeClass: 'bg-text-secondary border-text-secondary text-white' })
  return base
})

function pick(v: Exclude<Tri, null>) {
  if (props.disabled) return
  // Click-again clears = un-evaluate. Useful for fixing mis-clicks.
  emit('update:modelValue', props.modelValue === v ? null : v)
}
</script>

<template>
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0 flex-1">
      <p class="text-body text-text-primary">{{ label }}</p>
      <p v-if="description" class="text-small text-text-secondary mt-0.5">{{ description }}</p>
    </div>
    <div
      class="flex"
      role="radiogroup"
      :aria-label="label"
    >
      <button
        v-for="btn in buttons"
        :key="btn.v"
        type="button"
        role="radio"
        :aria-checked="modelValue === btn.v"
        :disabled="disabled"
        class="h-9 px-3 text-small font-medium border transition first:rounded-l-input last:rounded-r-input -ml-px first:ml-0"
        :class="modelValue === btn.v
          ? btn.activeClass
          : 'border-border bg-surface text-text-primary hover:bg-surface-muted'"
        @click="pick(btn.v)"
      >{{ btn.label }}</button>
    </div>
  </div>
</template>

<!--
  BulwarkSegmentedControl.vue — 2 to 4 mutually exclusive views
  (Packet A components/SPEC.md, WP-A2). More options: use BulwarkTabs.

  tablist / tab with roving tabindex; Left/Right/Home/End move and select.
  `block` stretches the control (mobile toolbars).
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

interface Option { value: string; label: string; icon?: IconName }
interface Props {
  modelValue: string
  options: Option[]
  block?: boolean
  ariaLabel?: string
}
const props = withDefaults(defineProps<Props>(), { block: false, ariaLabel: 'Segmented control' })
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
const buttons = ref<HTMLButtonElement[]>([])

function onKey(e: KeyboardEvent, i: number) {
  const n = props.options.length
  const next = e.key === 'ArrowRight' ? (i + 1) % n
    : e.key === 'ArrowLeft' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0
        : e.key === 'End' ? n - 1 : -1
  if (next < 0) return
  e.preventDefault()
  emit('update:modelValue', props.options[next]!.value)
  buttons.value[next]?.focus()
}
</script>

<template>
  <div class="bw-seg" :class="block && 'flex w-full'" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="(opt, i) in options"
      :key="opt.value"
      :ref="(el) => { if (el) buttons[i] = el as HTMLButtonElement }"
      type="button"
      role="tab"
      :class="[{ 'is-on': modelValue === opt.value }, block && 'flex-1 justify-center']"
      :aria-selected="modelValue === opt.value"
      :tabindex="modelValue === opt.value ? 0 : -1"
      @click="emit('update:modelValue', opt.value)"
      @keydown="onKey($event, i)"
    >
      <BulwarkIcon v-if="opt.icon" :name="opt.icon" size="sm" />{{ opt.label }}
    </button>
  </div>
</template>

<!--
  BulwarkMultiSelect.vue — choose several (Packet A components/SPEC.md, WP-A2).

  Selected values show as removable chips (Backspace or Delete on a focused
  chip removes it; more than `collapseAfter` collapse to "+n"). The options are
  a fieldset of native checkboxes, so labels, forms and keyboard behave
  natively; `max` disables the remaining options once reached and says so.
  ED-064: the SPEC's popup listbox (aria-multiselectable) is adopted per screen
  together with BulwarkSelect's combobox; the checkbox list stays the default.
-->
<script setup lang="ts">
interface Option { value: string; label: string; disabled?: boolean }
interface Props {
  modelValue: string[]
  label: string
  options: Option[]
  max?: number
  collapseAfter?: number
  error?: string
  helper?: string
  /** @deprecated use `helper`. */
  hint?: string
  required?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  max: undefined,
  collapseAfter: 3,
  error: '',
  helper: '',
  hint: '',
  required: false,
})
const emit = defineEmits<{ 'update:modelValue': [v: string[]] }>()

const uid = useId()
const helperText = computed(() => props.helper || props.hint)
const atMax = computed(() => props.max !== undefined && props.modelValue.length >= props.max)
const chosen = computed(() => props.modelValue.map((v) => props.options.find((o) => o.value === v) ?? { value: v, label: v }))
const shownChips = computed(() => chosen.value.slice(0, props.collapseAfter))
const hiddenCount = computed(() => Math.max(0, chosen.value.length - props.collapseAfter))
const chipEls = ref<HTMLElement[]>([])

function toggle(value: string) {
  const set = new Set(props.modelValue)
  if (set.has(value)) set.delete(value)
  else if (!atMax.value) set.add(value)
  emit('update:modelValue', [...set])
}

function removeAt(i: number) {
  const value = chosen.value[i]?.value
  if (value === undefined) return
  emit('update:modelValue', props.modelValue.filter((v) => v !== value))
  nextTick(() => chipEls.value[Math.max(0, i - 1)]?.focus())
}
</script>

<template>
  <fieldset class="bw-field" :aria-describedby="error ? `${uid}-err` : helperText ? `${uid}-hint` : undefined">
    <legend class="bw-label mb-1">
      {{ label }}<span v-if="required" class="req" aria-hidden="true">*</span>
    </legend>

    <div v-if="chosen.length" class="flex flex-wrap gap-1.5" aria-label="Selected">
      <span
        v-for="(c, i) in shownChips"
        :key="c.value"
        :ref="(el) => { if (el) chipEls[i] = el as HTMLElement }"
        class="bw-chip bw-chip--accent"
        tabindex="0"
        :aria-label="`${c.label}, press Backspace to remove`"
        @keydown.backspace.prevent="removeAt(i)"
        @keydown.delete.prevent="removeAt(i)"
      >
        {{ c.label }}
        <button type="button" class="x" :aria-label="`Remove ${c.label}`" tabindex="-1" @click="removeAt(i)">
          <BulwarkIcon name="x" size="sm" />
        </button>
      </span>
      <span v-if="hiddenCount" class="bw-chip">+{{ hiddenCount }}</span>
    </div>

    <div
      class="overflow-y-auto"
      style="max-height: 14rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--bg-card)"
      :style="error ? 'border-color: var(--danger-fg)' : undefined"
    >
      <label
        v-for="opt in options"
        :key="opt.value"
        class="flex items-center gap-3 px-3 cursor-pointer"
        style="min-height: var(--control-h); border-bottom: 1px solid var(--divider)"
        :style="(opt.disabled || (atMax && !modelValue.includes(opt.value))) ? 'opacity: .5; cursor: not-allowed' : undefined"
      >
        <input
          type="checkbox"
          class="h-4 w-4"
          style="accent-color: var(--accent)"
          :checked="modelValue.includes(opt.value)"
          :disabled="opt.disabled || (atMax && !modelValue.includes(opt.value))"
          @change="toggle(opt.value)"
        >
        <span style="font-size: var(--text-md); color: var(--text-primary)">{{ opt.label }}</span>
      </label>
    </div>

    <p v-if="atMax" class="bw-help" aria-live="polite">Up to {{ max }} — remove one to choose another.</p>
    <p v-if="error" :id="`${uid}-err`" class="bw-error" role="alert">
      <BulwarkIcon name="alert-circle" size="sm" />{{ error }}
    </p>
    <p v-else-if="helperText" :id="`${uid}-hint`" class="bw-help">{{ helperText }}</p>
  </fieldset>
</template>

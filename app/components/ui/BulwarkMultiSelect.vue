<!--
  BulwarkMultiSelect.vue — checkbox-list multi-select.

  Why this component exists
  -------------------------
  Compliance doc generator (E7) and quote-line subcontractor assignment
  (E6) need multi-pick. Considered a tag-style autocomplete but rejected:
  with our small-cardinality lists (5-50 items typical) a checkbox list
  is faster and a11y-clean. The autocomplete pattern lives in a future
  BulwarkCombobox if/when needed for large lists.
-->
<script setup lang="ts">
interface Option { value: string; label: string; disabled?: boolean }
interface Props {
  modelValue: string[]
  label: string
  options: Option[]
  error?: string
  hint?: string
  required?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  error: '',
  hint: '',
  required: false,
})

const emit = defineEmits<{ 'update:modelValue': [v: string[]] }>()

function toggle(value: string) {
  const set = new Set(props.modelValue)
  if (set.has(value)) set.delete(value); else set.add(value)
  emit('update:modelValue', [...set])
}
</script>

<template>
  <fieldset class="flex flex-col gap-1">
    <legend class="text-small font-medium text-text-primary mb-1">
      {{ label }}<span v-if="required" class="text-status-error ml-0.5">*</span>
    </legend>
    <div
      class="rounded-input border bg-surface divide-y divide-border max-h-56 overflow-y-auto"
      :class="error ? 'border-status-error' : 'border-border'"
    >
      <label
        v-for="opt in options"
        :key="opt.value"
        class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-muted"
        :class="opt.disabled && 'opacity-50 cursor-not-allowed'"
      >
        <input
          type="checkbox"
          class="h-4 w-4 accent-primary"
          :checked="modelValue.includes(opt.value)"
          :disabled="opt.disabled"
          @change="toggle(opt.value)"
        >
        <span class="text-body text-text-primary">{{ opt.label }}</span>
      </label>
    </div>
    <p v-if="error" class="text-small text-status-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="text-small text-text-secondary">{{ hint }}</p>
  </fieldset>
</template>

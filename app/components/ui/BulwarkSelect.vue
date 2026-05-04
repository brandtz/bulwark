<!--
  BulwarkSelect.vue — single-select dropdown.

  Why this component exists
  -------------------------
  Native <select> styled to match BulwarkInput. Native is intentional:
  - Mobile gets the OS picker wheel for free (huge UX win on iOS)
  - No focus-trap / outside-click bugs to maintain
  - Accessible by default
  When we need search-in-dropdown or multi-select we use BulwarkMultiSelect
  or a future BulwarkCombobox — different component, different problem.
-->
<script setup lang="ts">
interface Option { value: string; label: string; disabled?: boolean }

interface Props {
  modelValue: string | null | undefined
  label: string
  options: Option[]
  placeholder?: string
  error?: string
  required?: boolean
  disabled?: boolean
  hint?: string
  id?: string
}
const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Select...',
  error: '',
  hint: '',
  required: false,
  disabled: false,
  id: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `sel-${reactiveId}`)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="inputId" class="text-small font-medium text-text-primary">
      {{ label }}<span v-if="required" class="text-status-error ml-0.5">*</span>
    </label>
    <select
      :id="inputId"
      :value="modelValue ?? ''"
      :disabled="disabled"
      :required="required"
      :aria-invalid="!!error"
      class="h-input rounded-input border bg-surface px-3 text-body text-text-primary outline-none transition focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-surface-muted disabled:text-text-disabled"
      :class="[
        error ? 'border-status-error' : 'border-border',
        !modelValue && 'text-text-disabled',
      ]"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled hidden>{{ placeholder }}</option>
      <option
        v-for="opt in options"
        :key="opt.value"
        :value="opt.value"
        :disabled="opt.disabled"
      >
        {{ opt.label }}
      </option>
    </select>
    <p v-if="error" class="text-small text-status-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="text-small text-text-secondary">{{ hint }}</p>
  </div>
</template>

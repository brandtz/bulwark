<!--
  BulwarkDatePicker.vue — date input primitive.

  Why this component exists
  -------------------------
  Native <input type="date"> wrapped in our label/error treatment. Native
  is intentional: every browser ships a calendar picker that's better
  than anything we'd build, and mobile users get the OS wheel.

  When we eventually need a custom date-range picker (Compliance reporting
  filters), it ships as a separate component — single-date stays simple.
-->
<script setup lang="ts">
interface Props {
  modelValue: string | null
  label: string
  /** ISO yyyy-mm-dd. */
  min?: string
  /** ISO yyyy-mm-dd. */
  max?: string
  error?: string
  required?: boolean
  disabled?: boolean
  hint?: string
  id?: string
}
const props = withDefaults(defineProps<Props>(), {
  error: '',
  hint: '',
  min: undefined,
  max: undefined,
  required: false,
  disabled: false,
  id: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `dt-${reactiveId}`)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="inputId" class="text-small font-medium text-text-primary">
      {{ label }}<span v-if="required" class="text-status-error ml-0.5">*</span>
    </label>
    <input
      :id="inputId"
      type="date"
      :value="modelValue ?? ''"
      :min="min"
      :max="max"
      :required="required"
      :disabled="disabled"
      :aria-invalid="!!error"
      class="h-input rounded-input border bg-surface px-3 text-body text-text-primary outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-surface-muted disabled:text-text-disabled"
      :class="error ? 'border-status-error' : 'border-border'"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="error" class="text-small text-status-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="text-small text-text-secondary">{{ hint }}</p>
  </div>
</template>

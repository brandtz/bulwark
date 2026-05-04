<!--
  BulwarkTextarea.vue — multiline text input primitive.

  Why this component exists
  -------------------------
  Property notes, assessment observations, work-order scopes, invoice
  memos — every long-form field uses this. Same focus/error/label
  treatment as BulwarkInput so forms feel cohesive.

  Design decisions
  ----------------
  - **No auto-grow**: rejected the auto-growing textarea pattern; predictable
    fixed height + scroll is more reliable for our long property notes
    (paste a 2KB scope of work and an auto-growing textarea pushes other
    fields below the fold).
  - **`rows` prop**: caller controls vertical density.
-->
<script setup lang="ts">
interface Props {
  modelValue: string | null | undefined
  label: string
  placeholder?: string
  error?: string
  required?: boolean
  disabled?: boolean
  rows?: number
  hint?: string
  id?: string
}
const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  error: '',
  hint: '',
  required: false,
  disabled: false,
  rows: 4,
  id: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `txa-${reactiveId}`)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="inputId" class="text-small font-medium text-text-primary">
      {{ label }}<span v-if="required" class="text-status-error ml-0.5">*</span>
    </label>
    <textarea
      :id="inputId"
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :rows="rows"
      :aria-invalid="!!error"
      class="rounded-input border bg-surface p-3 text-body text-text-primary placeholder-text-disabled outline-none transition focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-surface-muted disabled:text-text-disabled resize-y min-h-[7.5rem]"
      :class="error ? 'border-status-error' : 'border-border'"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <p v-if="error" class="text-small text-status-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="text-small text-text-secondary">{{ hint }}</p>
  </div>
</template>

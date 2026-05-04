<!--
  BulwarkToggle.vue — boolean switch.

  Why this component exists
  -------------------------
  Settings screens, "active subcontractor?", "send notifications", etc.
  A native checkbox would work but the styled switch reads as
  "instantly applied" rather than "save to commit", which matches our
  settings/admin UX (most toggles autosave).

  A11y
  ----
  - role="switch" + aria-checked on the input
  - Click on label toggles via implicit <label> wrapping
  - Keyboard: Space toggles natively because the underlying control is
    a checkbox.
-->
<script setup lang="ts">
interface Props {
  modelValue: boolean
  label: string
  description?: string
  disabled?: boolean
  id?: string
}
const props = withDefaults(defineProps<Props>(), {
  description: '',
  disabled: false,
  id: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `tgl-${reactiveId}`)
</script>

<template>
  <label
    :for="inputId"
    class="flex items-start gap-3 cursor-pointer select-none"
    :class="disabled && 'opacity-50 cursor-not-allowed'"
  >
    <input
      :id="inputId"
      type="checkbox"
      role="switch"
      class="sr-only peer"
      :checked="modelValue"
      :disabled="disabled"
      :aria-checked="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span
      class="relative inline-flex h-6 w-11 shrink-0 rounded-full bg-border transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40"
    >
      <span
        class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
        :class="modelValue && 'translate-x-5'"
      />
    </span>
    <span class="flex flex-col">
      <span class="text-body text-text-primary">{{ label }}</span>
      <span v-if="description" class="text-small text-text-secondary">{{ description }}</span>
    </span>
  </label>
</template>

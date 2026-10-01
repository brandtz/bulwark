<!--
  BulwarkToggle.vue — on/off switch (Packet A components/SPEC.md, WP-A2).

  A native checkbox with role=switch (Space toggles, aria-checked follows), so
  forms, labels and keyboard behave natively. The whole row is the target
  (touch density: 48px). Either save on change or sit in a form with an
  explicit Save, never both.
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
    class="bw-togglerow cursor-pointer select-none"
    :class="disabled && 'cursor-not-allowed'"
  >
    <input
      :id="inputId"
      type="checkbox"
      role="switch"
      class="sr-only peer"
      :checked="modelValue"
      :disabled="disabled"
      :aria-checked="modelValue"
      :aria-describedby="description ? `${inputId}-desc` : undefined"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
    <span
      class="bw-toggle peer-focus-visible:[box-shadow:var(--focus-ring)]"
      :class="{ 'is-on': modelValue, 'is-disabled': disabled }"
      aria-hidden="true"
    />
    <span class="flex flex-col" :style="disabled ? 'opacity: .5' : undefined">
      <span style="font-size: var(--text-md); color: var(--text-primary)">{{ label }}</span>
      <span v-if="description" :id="`${inputId}-desc`" class="bw-help">{{ description }}</span>
    </span>
  </label>
</template>

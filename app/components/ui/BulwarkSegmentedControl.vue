<!--
  BulwarkSegmentedControl.vue — tabbed switch primitive.

  Used for view-mode toggles (Map | List | Calendar) and quick filters
  (My jobs | Team jobs | All).
-->
<script setup lang="ts">
interface Option { value: string; label: string }
interface Props {
  modelValue: string
  options: Option[]
  ariaLabel?: string
}
withDefaults(defineProps<Props>(), { ariaLabel: 'Segmented control' })

const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
</script>

<template>
  <div
    class="inline-flex rounded-input border border-border bg-surface-muted p-0.5"
    role="tablist"
    :aria-label="ariaLabel"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === opt.value"
      class="h-8 px-3 text-small font-medium rounded-[6px] transition"
      :class="modelValue === opt.value
        ? 'bg-surface text-text-primary shadow-sm'
        : 'text-text-secondary hover:text-text-primary'"
      @click="emit('update:modelValue', opt.value)"
    >{{ opt.label }}</button>
  </div>
</template>

<!--
  BulwarkTabs.vue — horizontal tabs with optional counts.

  Why this component exists
  -------------------------
  Property detail (Overview | Assessments | Quotes | Work Orders | Invoices),
  Subcontractor detail, etc. Single tab pattern across the app.

  Decisions
  ---------
  - **Per-tab slots `#tab-<value>`**: lets the consumer place tab body
    next to the tab declaration. Considered prop-driven but tabs almost
    always render different shape data per tab so slots are cleaner.
  - **No URL sync here**: lives in page components via `useRouteQuery`.
-->
<script setup lang="ts">
interface Tab { value: string; label: string; count?: number; disabled?: boolean }
interface Props {
  modelValue: string
  tabs: Tab[]
  ariaLabel?: string
}
withDefaults(defineProps<Props>(), { ariaLabel: 'Tabs' })

const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
</script>

<template>
  <div>
    <div
      class="border-b border-border flex gap-1 overflow-x-auto"
      role="tablist"
      :aria-label="ariaLabel"
    >
      <button
        v-for="t in tabs"
        :key="t.value"
        type="button"
        role="tab"
        :aria-selected="modelValue === t.value"
        :disabled="t.disabled"
        class="h-11 px-3 text-small font-medium border-b-2 transition whitespace-nowrap"
        :class="modelValue === t.value
          ? 'border-primary text-text-primary'
          : 'border-transparent text-text-secondary hover:text-text-primary'"
        @click="emit('update:modelValue', t.value)"
      >
        {{ t.label }}
        <span
          v-if="typeof t.count === 'number'"
          class="ml-1.5 inline-flex items-center justify-center rounded-full bg-surface-muted px-1.5 text-xs text-text-secondary"
        >{{ t.count }}</span>
      </button>
    </div>
    <div role="tabpanel" class="pt-4">
      <slot :name="`tab-${modelValue}`" />
    </div>
  </div>
</template>

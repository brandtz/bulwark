<!--
  BulwarkSectionHeader.vue — a section's heading row (Packet A components/SPEC.md, WP-A3).

  Heading at `level` (2 or 3, so the outline stays correct), optional count
  and description, actions on the right (they wrap under 480px; the screen
  passes an overflow BulwarkMenu when there are many). Slot: actions.
-->
<script setup lang="ts">
interface Props {
  title: string
  description?: string
  count?: number | null
  level?: 2 | 3
}
withDefaults(defineProps<Props>(), { description: '', count: null, level: 2 })
const slots = useSlots()
</script>

<template>
  <div class="bw-sech flex-wrap">
    <div class="min-w-0">
      <component :is="`h${level}`" class="flex items-center gap-2" :style="level === 3 ? 'margin:0;font:700 var(--text-lg) var(--font-display)' : undefined">
        {{ title }}
        <BulwarkChips v-if="count !== null" variant="count" :label="String(count)">{{ count }}</BulwarkChips>
      </component>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="slots.actions" class="flex gap-2 flex-wrap"><slot name="actions" /></div>
  </div>
</template>

<!--
  BulwarkTradeChip.vue — a trade tag (Packet A components/SPEC.md, WP-A3).
  Neutral chip with the wrench glyph; removable emits remove.
-->
<script setup lang="ts">
withDefaults(defineProps<{
  trade: string
  removable?: boolean
}>(), { removable: false })
const emit = defineEmits<{ remove: [] }>()
</script>

<template>
  <BulwarkChips :removable="removable" :label="trade" @remove="emit('remove')">
    <template #leading><BulwarkIcon name="wrench" size="sm" /></template>
    {{ trade }}
  </BulwarkChips>
</template>

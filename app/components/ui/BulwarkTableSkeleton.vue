<!--
  BulwarkTableSkeleton.vue — alias of BulwarkSkeleton kind="table" kept for
  existing imports (Packet A components/SPEC.md, WP-A2). `cols` is the old
  name of `columns`.
-->
<script setup lang="ts">
interface Props {
  rows?: number
  columns?: number
  /** @deprecated use `columns`. */
  cols?: number
}
const props = withDefaults(defineProps<Props>(), { rows: 8, columns: 5, cols: undefined })
</script>

<template>
  <BulwarkSkeleton kind="table" :rows="props.rows" :columns="props.cols ?? props.columns" />
</template>

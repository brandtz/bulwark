<!--
  BulwarkProgramChip.vue — a program tag (Packet A components/SPEC.md, WP-A3).
  Accent chip with a decorative icon by program kind; removable emits remove.
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

interface Props {
  program: { id: string, name: string, kind?: string | null }
  removable?: boolean
}
const props = withDefaults(defineProps<Props>(), { removable: false })
const emit = defineEmits<{ remove: [] }>()
const icon = computed<IconName>(() => (props.program.kind === 'wildfire' || /wildfire/iu.test(props.program.name) ? 'flame' : props.program.kind === 'rebate' ? 'dollar-sign' : 'clipboard'))
</script>

<template>
  <BulwarkChips variant="accent" :removable="removable" :label="program.name" :data-program="program.id" @remove="emit('remove')">
    <template #leading><BulwarkIcon :name="icon" size="sm" /></template>
    {{ program.name }}
  </BulwarkChips>
</template>

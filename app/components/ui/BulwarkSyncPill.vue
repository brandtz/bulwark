<!--
  BulwarkSyncPill.vue — connection / sync state (Packet A components/SPEC.md, WP-A3).

  role=status, polite. The text label is always present unless `compact`,
  where it becomes the accessible name and tooltip. A conflict reads as an
  action ("Resolve") and the pill is a button emitting `click`.
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

type State = 'online' | 'syncing' | 'offline' | 'pending' | 'conflict'
const props = withDefaults(defineProps<{
  state: State
  pending?: number
  compact?: boolean
}>(), { pending: 0, compact: false })
const emit = defineEmits<{ click: [] }>()

const ICON: Record<State, IconName> = { online: 'check-circle', syncing: 'refresh', offline: 'x-circle', pending: 'clock', conflict: 'alert-triangle' }
const text = computed(() => ({
  online: 'Online',
  syncing: 'Syncing…',
  offline: props.pending ? `Offline · ${props.pending} waiting` : 'Offline',
  pending: `${props.pending} to sync`,
  conflict: 'Conflict · Resolve',
}[props.state]))
</script>

<template>
  <!-- The button keeps its name (role=status on it would erase it); state
       changes are announced by the separate polite live region. -->
  <span class="inline-flex">
    <button
      type="button"
      class="bw-pill"
      :class="state !== 'conflict' ? `bw-pill--${state}` : ''"
      :style="state === 'conflict' ? 'color: var(--danger-fg); border-color: var(--danger-border); background: var(--danger-bg)' : undefined"
      :aria-label="text"
      :title="compact ? text : undefined"
      data-testid="sync-pill"
      :data-state="state"
      @click="emit('click')"
    >
      <BulwarkIcon :name="ICON[state]" size="sm" />
      <span v-if="!compact" aria-hidden="true">{{ text }}</span>
    </button>
    <span class="sr-only" role="status" aria-live="polite">{{ text }}</span>
  </span>
</template>

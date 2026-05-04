<!--
  app/components/workorder/JobProgressUpdater.vue — E6-S4.

  # Decisions (ADR-0008)
    - One reusable component that owns the per-trade-slot status flow:
      `assigned` → `in_progress` → `completed`. Plus a `block` action
      that pushes the slot to `blocked` (recoverable; resumes back to
      `in_progress` when un-blocked) and an idempotent no-op when the
      caller already passes `unassigned` (we render an inert badge
      because there is no transition to expose without a sub).
    - The component is presentational + emits-only. The parent decides
      how to persist the change (mocked in S4, real RPC later). This
      keeps the test surface tight and avoids smuggling service calls
      down the tree.
    - Photo capture is intentionally a disabled placeholder. ADR will
      revisit when the file-upload surface (E10 audit/photo storage)
      lands. Caption is visible so we don't pretend the feature ships.

  # Decision cast down
    - Rejected: a state machine library. Five states, one terminal,
      one block-side branch \u2014 a hand-rolled `nextActions` map is
      legible and avoids the dependency.
-->
<script setup lang="ts">
import type { TradeSlotStatus } from '~~/shared/contracts/work-order'

interface Props {
  status: TradeSlotStatus
  hasAssignment: boolean
  busy?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  busy: false,
})

const emit = defineEmits<{
  update: [next: TradeSlotStatus]
}>()

interface Action {
  label: string
  next: TradeSlotStatus
  variant: 'primary' | 'secondary'
  testid: string
}

const actions = computed<Action[]>(() => {
  if (!props.hasAssignment) return []
  switch (props.status) {
    case 'assigned':
      return [
        {
          label: 'Start work',
          next: 'in_progress',
          variant: 'primary',
          testid: 'progress-start',
        },
        {
          label: 'Mark blocked',
          next: 'blocked',
          variant: 'secondary',
          testid: 'progress-block',
        },
      ]
    case 'in_progress':
      return [
        {
          label: 'Mark complete',
          next: 'completed',
          variant: 'primary',
          testid: 'progress-complete',
        },
        {
          label: 'Mark blocked',
          next: 'blocked',
          variant: 'secondary',
          testid: 'progress-block',
        },
      ]
    case 'blocked':
      return [
        {
          label: 'Resume',
          next: 'in_progress',
          variant: 'primary',
          testid: 'progress-resume',
        },
      ]
    case 'completed':
      return [
        {
          label: 'Reopen',
          next: 'in_progress',
          variant: 'secondary',
          testid: 'progress-reopen',
        },
      ]
    default:
      return []
  }
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" data-testid="job-progress-updater">
    <BulwarkButton
      v-for="a in actions"
      :key="a.testid"
      type="button"
      :variant="a.variant"
      :disabled="props.busy"
      :data-testid="a.testid"
      @click="emit('update', a.next)"
    >
      {{ a.label }}
    </BulwarkButton>

    <span
      v-if="!props.hasAssignment"
      class="text-small text-text-secondary"
      data-testid="progress-needs-assignment"
    >
      Assign a subcontractor to start tracking progress.
    </span>

    <!-- Photo placeholder (E10 will wire real capture). -->
    <button
      type="button"
      class="inline-flex items-center gap-1 rounded-input border border-border-default px-3 py-1.5 text-small text-text-disabled bg-surface-muted/40 cursor-not-allowed"
      disabled
      data-testid="progress-photo-placeholder"
      title="Photo capture lands in E10"
    >
      <span aria-hidden="true">·</span>
      Add photo (coming soon)
    </button>
  </div>
</template>

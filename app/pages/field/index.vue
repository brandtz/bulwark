<!--
  app/pages/field/index.vue — My Day (W3-3 / EH-M / ADR-0029).

  # What this is
    The single-screen "what am I doing today" surface that drops a field
    crew into their day's scheduled work orders. Replaces nothing —
    pages/field/dashboard.vue (E10-S1) continues to exist for users who
    follow the legacy entry point. The new "/field" route is the PWA
    home screen target documented in ADR-0029.

  # Decisions (ADR-0008)
    - Uses the new field layout (separate from default.vue's sidebar /
      bottom-nav) — definePageMeta carries `layout: 'field'` so the
      shell renders the four-tab strip instead of the global one.
    - Reads from `/api/field/my-day` (a thin endpoint that delegates to
      `RealWorkOrderService.listForFieldUser`). We deliberately avoid
      the RPC dispatcher here because listForFieldUser is not on the
      shared IWorkOrderService interface (per ADR-0029 deliverable F).
    - Refresh is an explicit button — pull-to-refresh is left to Phase
      2 (deliverable B.1 footnote).

  # Decision cast down
    - Rejected: prefetching tomorrow's day. The crew always wants
      "today" by default; surfacing tomorrow accidentally promotes
      "look-ahead planning" into the field surface which the persona
      explicitly does not own.
-->
<script setup lang="ts">
import { useLabel } from '~/composables/useLabel'
import type { WorkOrder } from '~~/shared/contracts/work-order'

definePageMeta({
  layout: 'field',
  middleware: 'field-role',
  fieldTitle: 'My Day',
})

useHead({ title: 'My Day' })

const { t } = useLabel()

interface MyDayResponse {
  rows: WorkOrder[]
  date: string
}

const { data, refresh, pending } = await useFetch<MyDayResponse>('/api/field/my-day', {
  server: false,
})

const today = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function timeWindow(wo: WorkOrder): string {
  const start = formatTime(wo.scheduledStart)
  const end = formatTime(wo.scheduledEnd)
  if (!wo.scheduledEnd) return start
  return `${start} – ${end}`
}

function priorityTone(p: string | undefined | null): string {
  switch (p) {
    case 'urgent':
      return 'bg-status-error/10 text-status-error'
    case 'high':
      return 'bg-status-warning/10 text-status-warning'
    case 'normal':
      return 'bg-status-info/10 text-status-info'
    case 'low':
    default:
      return 'bg-surface-muted text-text-secondary'
  }
}
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-my-day">
    <header class="flex items-center justify-between">
      <div>
        <p class="text-small text-text-secondary">{{ today }}</p>
        <h1 class="text-display mt-1">{{ t('field.tabs', 'my-day', 'My Day') }}</h1>
      </div>
      <button
        type="button"
        class="min-h-tap min-w-tap px-3 rounded-input border border-border text-small"
        data-testid="field-my-day-refresh"
        :aria-busy="pending"
        @click="() => refresh()"
      >
        Refresh
      </button>
    </header>

    <ul v-if="data && data.rows.length > 0" class="mt-4 flex flex-col gap-3">
      <li v-for="wo in data.rows" :key="wo.id" data-testid="field-my-day-row">
        <NuxtLink
          :to="`/field/jobs/${wo.id}`"
          class="block bg-surface border border-border rounded-card p-4 hover:border-primary transition-colors active:scale-[.99]"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-tiny uppercase text-text-secondary">
                {{ wo.workOrderNumber }} · {{ timeWindow(wo) }}
              </p>
              <p class="text-body font-semibold mt-1 truncate">
                {{ wo.notes ?? wo.workOrderNumber }}
              </p>
              <p class="text-small text-text-secondary mt-1">
                {{ wo.tradeSlots.length }} trade slot(s)
              </p>
            </div>
            <span
              :class="['text-tiny font-semibold px-2 py-1 rounded-full whitespace-nowrap', priorityTone(wo.priority ?? 'normal')]"
              data-testid="field-my-day-priority"
            >
              {{ t('work-order.priority', wo.priority ?? 'normal', wo.priority ?? 'normal') }}
            </span>
          </div>
          <div class="mt-3 pt-3 border-t border-border-muted flex items-center justify-between">
            <span class="text-small text-text-secondary">
              {{ t('status.work_order', wo.status, wo.status) }}
            </span>
            <span class="text-small font-semibold text-primary">Start ›</span>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <div
      v-else
      class="mt-6 bg-surface border border-border rounded-card p-6 text-center"
      data-testid="field-my-day-empty"
    >
      <p class="text-body text-text-secondary">
        {{ t('field', 'empty-day', 'Nothing scheduled today.') }}
      </p>
    </div>
  </div>
</template>

<!--
  app/pages/admin/dispatch.vue — 7-day dispatch board (W2-3 / EH-G / ADR-0020).

  # Decisions (ADR-0008)
    - Read-only kanban: rows = subcontractors + a synthetic
      "Unassigned" row at the top, columns = the next 7 days starting
      today. Each cell renders the work-order trade-slots whose
      `scheduledStart` falls on that day.
    - No drag-and-drop in v1. The reschedule flow lives on
      `/admin/work-orders/[id]` (workOrder.schedule). The board is a
      situational-awareness surface; deeper edits stay on the WO row.
    - Week pivots in UTC midnight of the user's local day. We compute
      day buckets in JS without any date library — the board is
      coarse-grained and a one-off helper is cheaper than a dep.
    - Filter chips by priority let dispatchers triage on a busy day.

  # Decision cast down
    - Rejected: paginated multi-week scroll. STYLE_GUIDE prefers a
      single tight surface; "next 7 days" is the operationally
      relevant window. Week-over-week comparisons live on the
      reports module (future).
    - Rejected: cross-tenant subcontractor view. The board is org-
      scoped — no superadmin shortcut.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { WorkOrder, TradeSlot, WorkOrderPriority } from '~~/shared/contracts/work-order'
import type { Subcontractor } from '~~/shared/contracts/subcontractor'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Dispatch board' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const workOrder = useService('workOrder')
const subcontractor = useService('subcontractor')

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const priorityFilter = ref<'all' | WorkOrderPriority>('all')

const { data: bundle } = await useAsyncData(
  'dispatch-board',
  async () => {
    if (!orgId.value) return { workOrders: [] as WorkOrder[], subs: [] as Subcontractor[] }
    const [wos, subs] = await Promise.all([
      workOrder.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
      subcontractor.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
    ])
    return { workOrders: wos.rows, subs: subs.rows }
  },
  { server: false, default: () => ({ workOrders: [] as WorkOrder[], subs: [] as Subcontractor[] }) },
)

// Week buckets — 7 days starting today (local midnight).
function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
const today = startOfDay(new Date())
const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  }),
)
const dayLabels = computed(() =>
  days.value.map((d) => ({
    iso: d.toISOString().slice(0, 10),
    short: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.getDate(),
    isToday: d.getTime() === today.getTime(),
  })),
)

type SlotRow = { wo: WorkOrder; slot: TradeSlot }

const slotsByRowByDay = computed(() => {
  const out = new Map<string, Map<string, SlotRow[]>>()
  // Initialize unassigned bucket + each sub.
  out.set('unassigned', new Map())
  for (const s of bundle.value.subs) out.set(s.id, new Map())
  for (const wo of bundle.value.workOrders) {
    if (priorityFilter.value !== 'all' && (wo.priority ?? 'normal') !== priorityFilter.value) continue
    for (const slot of wo.tradeSlots ?? []) {
      if (!slot.scheduledStart) continue
      const dayIso = slot.scheduledStart.slice(0, 10)
      if (!dayLabels.value.some((l) => l.iso === dayIso)) continue
      const rowKey = slot.assignedSubcontractorId ?? 'unassigned'
      const rowMap = out.get(rowKey) ?? out.get('unassigned')!
      const cell = rowMap.get(dayIso) ?? []
      cell.push({ wo, slot })
      rowMap.set(dayIso, cell)
    }
  }
  return out
})

const rows = computed(() => [
  { id: 'unassigned', name: 'Unassigned', companyName: null as string | null },
  ...bundle.value.subs.map((s) => ({ id: s.id, name: s.companyName, companyName: s.companyName })),
])

function cellSlots(rowId: string, dayIso: string): SlotRow[] {
  return slotsByRowByDay.value.get(rowId)?.get(dayIso) ?? []
}

const PRIORITY_TONE: Record<WorkOrderPriority, string> = {
  low: 'bg-surface-muted text-text-secondary',
  normal: 'bg-status-info/10 text-status-info',
  high: 'bg-status-warning/10 text-status-warning',
  urgent: 'bg-status-error/10 text-status-error',
}
</script>

<template>
  <div class="space-y-6 p-6">
    <header class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-text-primary">Dispatch board</h1>
        <p class="text-sm text-text-secondary">
          Next 7 days. Scheduled trade slots grouped by subcontractor.
        </p>
      </div>
      <div class="flex gap-2 text-xs">
        <button
          v-for="opt in ([
            { v: 'all', label: 'All' },
            { v: 'urgent', label: 'Urgent' },
            { v: 'high', label: 'High' },
            { v: 'normal', label: 'Normal' },
            { v: 'low', label: 'Low' },
          ] as const)"
          :key="opt.v"
          type="button"
          class="rounded-full border px-3 py-1"
          :class="priorityFilter === opt.v
            ? 'border-brand-primary bg-brand-primary text-white'
            : 'border-border-default bg-surface-base text-text-secondary'"
          @click="priorityFilter = opt.v as 'all' | WorkOrderPriority"
        >
          {{ opt.label }}
        </button>
      </div>
    </header>

    <div class="overflow-x-auto rounded-md border border-border-default bg-surface-base">
      <table class="w-full min-w-[800px] table-fixed border-collapse text-sm">
        <thead class="bg-surface-muted text-left text-xs uppercase tracking-wide text-text-tertiary">
          <tr>
            <th class="sticky left-0 z-10 w-40 bg-surface-muted px-3 py-2">Subcontractor</th>
            <th
              v-for="d in dayLabels"
              :key="d.iso"
              class="px-3 py-2"
              :class="d.isToday ? 'text-brand-primary' : ''"
            >
              {{ d.short }} {{ d.day }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            class="border-t border-border-default align-top"
          >
            <th class="sticky left-0 z-10 w-40 bg-surface-base px-3 py-2 text-left font-medium text-text-primary">
              {{ row.name }}
              <span v-if="row.id === 'unassigned'" class="block text-xs font-normal text-text-tertiary">No sub assigned</span>
            </th>
            <td
              v-for="d in dayLabels"
              :key="`${row.id}-${d.iso}`"
              class="border-l border-border-default px-2 py-2"
              :data-test="`dispatch-cell-${row.id}-${d.iso}`"
            >
              <ul class="space-y-1">
                <li
                  v-for="item in cellSlots(row.id, d.iso)"
                  :key="`${item.wo.id}-${item.slot.id}`"
                  class="rounded border border-border-default bg-surface-muted px-2 py-1 text-xs"
                >
                  <NuxtLink :to="`/admin/work-orders/${item.wo.id}`" class="block hover:underline">
                    <div class="flex items-center justify-between gap-1">
                      <span class="truncate font-medium">{{ item.slot.trade }}</span>
                      <span
                        class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        :class="PRIORITY_TONE[item.wo.priority ?? 'normal']"
                      >
                        {{ item.wo.priority ?? 'normal' }}
                      </span>
                    </div>
                    <div class="text-text-tertiary truncate">{{ item.slot.description }}</div>
                  </NuxtLink>
                </li>
                <li v-if="cellSlots(row.id, d.iso).length === 0" class="text-xs text-text-tertiary">—</li>
              </ul>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

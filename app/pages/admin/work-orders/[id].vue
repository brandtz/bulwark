<!--
  app/pages/admin/work-orders/[id].vue — work-order detail (E6-S1).

  # Decisions (ADR-0008)
    - Single page that surfaces the three things Drew + the field crew
      need: trades + assignments, schedule window, materials list. Each
      block is its own card so future stories (E6-S3 sub assignment,
      E6-S4 progress updater) can drop in without restructuring.
    - `useAsyncData(\u2026 { server: false })` matches the rest of E5/E6: the
      seed fixture lives in the same module instance the client mutates,
      so client-only fetch keeps reads consistent with writes.
    - We render trade slots in a vertical card stack on mobile and a
      table-like grid on \u2265md, mirroring the quote builder.
    - The `assigned subcontractor` rendering is purely informational in
      S1 \u2014 the editable assignment lands in E6-S3.

  # Decision cast down
    - Rejected: a tabbed layout. The page is short enough on a phone
      that one scroll covers everything; tabs would just hide context.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { formatCents } from '~~/shared/utils/money'
import {
  type WorkOrder,
  type WorkOrderStatus,
  type TradeSlotStatus,
} from '~~/shared/contracts/work-order'
import { TRADE_LABEL, type Subcontractor } from '~~/shared/contracts/subcontractor'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Work order' })

const route = useRoute()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const workOrder = useService('workOrder')
const property = useService('property')
const subcontractor = useService('subcontractor')

const workOrderId = computed(() => String(route.params.id))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: bundle } = await useAsyncData(
  () => `work-order-detail-${workOrderId.value}-${orgId.value}`,
  async () => {
    const wo = await workOrder.get(workOrderId.value, orgId.value)
    if (!wo) return { workOrder: null, property: null, subs: new Map<string, Subcontractor>() }
    const [prop, subList] = await Promise.all([
      property.get(wo.propertyId, orgId.value),
      subcontractor.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
    ])
    const subs = new Map<string, Subcontractor>(
      subList.rows.map((s) => [s.id, s] as const),
    )
    return { workOrder: wo, property: prop, subs }
  },
  { server: false, watch: [workOrderId, orgId] },
)

const propertyAddress = computed(() => {
  const p = bundle.value?.property
  return p ? `${p.addressLine1}, ${p.city}, ${p.state}` : ''
})

const STATUS_TONE: Record<WorkOrderStatus, string> = {
  draft: 'bg-surface-muted text-text-secondary',
  scheduled: 'bg-status-info/10 text-status-info',
  in_progress: 'bg-status-warning/10 text-status-warning',
  completed: 'bg-status-success/10 text-status-success',
  cancelled: 'bg-status-error/10 text-status-error',
}

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const SLOT_TONE: Record<TradeSlotStatus, string> = {
  unassigned: 'bg-surface-muted text-text-secondary',
  assigned: 'bg-status-info/10 text-status-info',
  in_progress: 'bg-status-warning/10 text-status-warning',
  completed: 'bg-status-success/10 text-status-success',
  blocked: 'bg-status-error/10 text-status-error',
}

const SLOT_LABEL: Record<TradeSlotStatus, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
}

function formatScheduleWindow(w: WorkOrder | null): string {
  if (!w?.scheduledStart || !w?.scheduledEnd) return 'Not scheduled'
  const start = new Date(w.scheduledStart)
  const end = new Date(w.scheduledEnd)
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${fmt.format(start)} \u2192 ${fmt.format(end)}`
}

function subDisplay(slotSubId: string | null): string {
  if (!slotSubId) return 'Unassigned'
  const sub = bundle.value?.subs.get(slotSubId)
  return sub ? sub.companyName : 'Unknown sub'
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-4xl mx-auto" data-testid="work-order-detail">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Work orders', to: '/admin/work-orders' },
        { label: bundle?.workOrder?.workOrderNumber ?? 'Work order' },
      ]"
    />

    <div v-if="!bundle?.workOrder" class="mt-6">
      <EmptyState
        icon="·"
        title="Work order not found"
        body="It may have been cancelled, deleted, or belongs to another organization."
        :cta="{ label: 'Back to work orders', to: '/admin/work-orders' }"
        data-testid="work-order-not-found"
      />
    </div>

    <template v-else>
      <header class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-display" data-testid="work-order-number">
            {{ bundle.workOrder.workOrderNumber }}
          </h1>
          <p v-if="propertyAddress" class="text-body text-text-secondary mt-1">
            {{ propertyAddress }}
          </p>
        </div>
        <span
          :class="[
            'inline-flex items-center rounded-pill px-3 py-1 text-small font-medium whitespace-nowrap',
            STATUS_TONE[bundle.workOrder.status],
          ]"
          data-testid="work-order-status"
          :data-status="bundle.workOrder.status"
        >
          {{ STATUS_LABEL[bundle.workOrder.status] }}
        </span>
      </header>

      <!-- Schedule window ---------------------------------------- -->
      <BulwarkCard padding="md" class="mt-6" data-testid="work-order-schedule">
        <h2 class="text-h2 mb-2">Schedule</h2>
        <p class="text-body" data-testid="schedule-window">
          {{ formatScheduleWindow(bundle.workOrder) }}
        </p>
      </BulwarkCard>

      <!-- Trade slots -------------------------------------------- -->
      <section class="mt-6" data-testid="trade-slots">
        <h2 class="text-h2 mb-2">Trades</h2>
        <BulwarkCard padding="none">
          <ul class="divide-y divide-border-default">
            <li
              v-for="slot in bundle.workOrder.tradeSlots"
              :key="slot.id"
              class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4"
              data-testid="trade-slot"
              :data-trade="slot.trade"
            >
              <div class="md:col-span-4">
                <p class="text-body font-medium text-text-primary" data-testid="trade-slot-trade">
                  {{ TRADE_LABEL[slot.trade] }}
                </p>
                <p class="text-small text-text-secondary">
                  {{ slot.description }}
                </p>
              </div>
              <div class="md:col-span-4 flex items-baseline gap-2">
                <span class="md:hidden text-small text-text-secondary">Sub</span>
                <span class="text-body" data-testid="trade-slot-sub">
                  {{ subDisplay(slot.assignedSubcontractorId) }}
                </span>
              </div>
              <div class="md:col-span-4 flex md:justify-end items-center">
                <span
                  :class="[
                    'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                    SLOT_TONE[slot.status],
                  ]"
                  data-testid="trade-slot-status"
                  :data-status="slot.status"
                >
                  {{ SLOT_LABEL[slot.status] }}
                </span>
              </div>
            </li>
          </ul>
        </BulwarkCard>
      </section>

      <!-- Materials ---------------------------------------------- -->
      <section
        v-if="bundle.workOrder.materials.length > 0"
        class="mt-6"
        data-testid="materials"
      >
        <h2 class="text-h2 mb-2">Materials</h2>
        <BulwarkCard padding="none">
          <ul class="divide-y divide-border-default">
            <li
              v-for="m in bundle.workOrder.materials"
              :key="m.id"
              class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4"
              data-testid="material-row"
            >
              <div class="md:col-span-7">
                <p class="text-body font-medium text-text-primary">{{ m.name }}</p>
              </div>
              <div class="md:col-span-2 flex md:justify-end items-baseline gap-2">
                <span class="md:hidden text-small text-text-secondary">Qty</span>
                <span class="text-body">{{ m.quantity }} {{ m.unit }}</span>
              </div>
              <div class="md:col-span-3 flex md:justify-end items-baseline gap-2">
                <span class="md:hidden text-small text-text-secondary">Unit</span>
                <span class="text-body">{{ formatCents(m.unitCostCents) }}</span>
              </div>
            </li>
          </ul>
        </BulwarkCard>
      </section>

      <!-- Notes ------------------------------------------------- -->
      <section v-if="bundle.workOrder.notes" class="mt-6" data-testid="work-order-notes">
        <h2 class="text-h2 mb-2">Notes</h2>
        <BulwarkCard padding="md">
          <p class="text-body whitespace-pre-line">{{ bundle.workOrder.notes }}</p>
        </BulwarkCard>
      </section>
    </template>
  </div>
</template>

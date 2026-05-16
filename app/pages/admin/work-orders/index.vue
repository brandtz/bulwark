<!--
  app/pages/admin/work-orders/index.vue — work orders list (E6-S1).

  # Decisions (ADR-0008)
    - Org-wide list of work orders. Each row links to the detail at
      `/admin/work-orders/[id]`. Sidebar already advertises this route
      so the page must exist; an empty-state CTA keeps the UX honest
      until the create-from-quote flow lands in E6-S2.
    - Filters by status mirror the quotes-list pattern (segmented
      control + `?status=` query). Reusing the convention so the muscle
      memory transfers.
    - `{ server: false }` on the asyncData. Future work orders are
      created client-side via mock services; SSR hits a different
      module instance with only the seed row. Reading client-side is
      consistent with the rest of the app.

  # Decision cast down
    - Rejected: tenant-scoped sub assignment chips on the row. The
      detail page owns that surface; the list stays scannable.
    - Rejected: pagination wiring. Fixture-scale never overflows
      pageSize=100; we'll wire it when the SQL impl lands.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { WorkOrder, WorkOrderStatus, WorkOrderPriority } from '~~/shared/contracts/work-order'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Work orders' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const workOrder = useService('workOrder')
const property = useService('property')
const { t: tLabel } = useLabel()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const STATUS_FILTERS: { value: 'all' | WorkOrderStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

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

const activeFilter = computed<'all' | WorkOrderStatus>(() => {
  const q = String(route.query.status ?? 'all')
  return STATUS_FILTERS.some((f) => f.value === q)
    ? (q as 'all' | WorkOrderStatus)
    : 'all'
})

function setFilter(v: string) {
  router.push({ query: { ...route.query, status: v === 'all' ? undefined : v } })
}

// W4-1 / EH-P — saved-views integration.
const currentFilters = computed(() => ({ status: activeFilter.value }))
function applySavedView(payload: { filters: Record<string, unknown> }) {
  const next = typeof payload.filters?.status === 'string' ? payload.filters.status : 'all'
  setFilter(next)
}

const { data: bundle } = await useAsyncData(
  () => `work-orders-list-${orgId.value}-${activeFilter.value}`,
  async () => {
    const list = await workOrder.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 100,
      status:
        activeFilter.value === 'all'
          ? undefined
          : (activeFilter.value as WorkOrderStatus),
    })
    const propertyIds = Array.from(new Set(list.rows.map((w) => w.propertyId)))
    const propMap = new Map<string, string>()
    await Promise.all(
      propertyIds.map(async (pid) => {
        const p = await property.get(pid, orgId.value)
        if (p) propMap.set(pid, `${p.addressLine1}, ${p.city}, ${p.state}`)
      }),
    )
    return { rows: list.rows, total: list.total, propMap }
  },
  { server: false, watch: [orgId, activeFilter] },
)

function addressFor(w: WorkOrder): string {
  return bundle.value?.propMap.get(w.propertyId) ?? ''
}

const PRIORITY_TONE: Record<WorkOrderPriority, string> = {
  low: 'bg-surface-muted text-text-secondary',
  normal: 'bg-status-info/10 text-status-info',
  high: 'bg-status-warning/10 text-status-warning',
  urgent: 'bg-status-error/10 text-status-error',
}
function priorityCopy(p: WorkOrderPriority): string {
  return tLabel('work-order.priority', p, p)
}
function statusCopy(s: WorkOrderStatus): string {
  return tLabel('status.work_order', s, STATUS_LABEL[s])
}
function scheduledDateLabel(w: WorkOrder): string {
  if (!w.scheduledStart) return ''
  return new Date(w.scheduledStart).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
function dueInDays(w: WorkOrder): number | null {
  if (!w.scheduledStart) return null
  if (w.status === 'in_progress' || w.status === 'completed' || w.status === 'cancelled') return null
  const ms = new Date(w.scheduledStart).getTime() - Date.now()
  if (Number.isNaN(ms)) return null
  return Math.ceil(ms / 86_400_000)
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="work-orders-list">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-display">Work orders</h1>
        <p class="text-body text-text-secondary mt-1">
          {{ bundle?.total ?? 0 }}
          {{ (bundle?.total ?? 0) === 1 ? 'work order' : 'work orders' }}
          <span v-if="activeFilter !== 'all'"> · {{ STATUS_LABEL[activeFilter as WorkOrderStatus] }}</span>
        </p>
      </div>
      <NuxtLink
        to="/admin/work-orders/new"
        data-testid="new-work-order-button"
        class="inline-flex items-center justify-center rounded-input bg-primary text-white text-body font-medium px-4 h-input hover:bg-primary-hover transition-colors"
      >
        + New work order
      </NuxtLink>
    </header>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
      <BulwarkSegmentedControl
        :model-value="activeFilter"
        :options="STATUS_FILTERS"
        aria-label="Filter work orders by status"
        data-testid="work-order-status-filter"
        @update:model-value="setFilter"
      />
      <SavedViewsMenu
        entity-type="work-order"
        :current-filters="currentFilters"
        @apply="applySavedView"
      />
    </div>

    <div v-if="!bundle" class="mt-6" data-testid="work-orders-loading">
      <!-- W2-6 / EH-L: shimmer rows during the client-side fetch. -->
      <BulwarkTableSkeleton :rows="6" :cols="4" />
    </div>

    <div v-else-if="bundle.rows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No work orders here yet"
        body="Work orders are created from accepted quotes — pick one to schedule below."
        :cta="{ label: 'New work order', to: '/admin/work-orders/new' }"
        data-testid="work-orders-empty"
      />
    </div>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li
        v-for="w in bundle.rows"
        :key="w.id"
        data-testid="work-order-row"
      >
        <NuxtLink :to="`/admin/work-orders/${w.id}`" class="block">
          <BulwarkCard padding="md" clickable>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-body font-medium text-text-primary" data-testid="work-order-row-number">
                  {{ w.workOrderNumber }}
                </p>
                <p
                  v-if="addressFor(w)"
                  class="text-small text-text-secondary truncate"
                  data-testid="work-order-row-address"
                >
                  {{ addressFor(w) }}
                </p>
              </div>
              <div class="flex items-center gap-3 flex-wrap">
                <span
                  class="inline-flex items-center rounded-pill px-2 py-0.5 text-tiny font-medium whitespace-nowrap"
                  :class="PRIORITY_TONE[(w.priority ?? 'normal') as WorkOrderPriority]"
                  data-testid="work-order-row-priority"
                  :data-priority="w.priority ?? 'normal'"
                >{{ priorityCopy((w.priority ?? 'normal') as WorkOrderPriority) }}</span>
                <span
                  v-if="scheduledDateLabel(w)"
                  class="text-small text-text-secondary"
                  data-testid="work-order-row-scheduled"
                >{{ scheduledDateLabel(w) }}</span>
                <span
                  v-if="dueInDays(w) !== null"
                  class="inline-flex items-center rounded-pill px-2 py-0.5 text-tiny font-medium whitespace-nowrap"
                  :class="(dueInDays(w) ?? 0) < 0
                    ? 'bg-status-error/10 text-status-error'
                    : (dueInDays(w) ?? 0) <= 2
                      ? 'bg-status-warning/10 text-status-warning'
                      : 'bg-surface-muted text-text-secondary'"
                  data-testid="work-order-row-due-in"
                >
                  <template v-if="(dueInDays(w) ?? 0) < 0">
                    Overdue {{ -(dueInDays(w) ?? 0) }}d
                  </template>
                  <template v-else>
                    Due in {{ dueInDays(w) }}d
                  </template>
                </span>
                <span
                  :class="[
                    'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                    STATUS_TONE[w.status],
                  ]"
                  data-testid="work-order-row-status"
                  :data-status="w.status"
                >
                  {{ statusCopy(w.status) }}
                </span>
                <span class="text-small text-text-secondary">
                  {{ w.tradeSlots.length }} trade{{ w.tradeSlots.length === 1 ? '' : 's' }}
                </span>
              </div>
            </div>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

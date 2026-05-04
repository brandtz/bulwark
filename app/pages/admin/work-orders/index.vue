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
import type { WorkOrder, WorkOrderStatus } from '~~/shared/contracts/work-order'

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
    </header>

    <div class="mt-4">
      <BulwarkSegmentedControl
        :model-value="activeFilter"
        :options="STATUS_FILTERS"
        aria-label="Filter work orders by status"
        data-testid="work-order-status-filter"
        @update:model-value="setFilter"
      />
    </div>

    <div v-if="!bundle || bundle.rows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No work orders here yet"
        body="Work orders are created from accepted quotes. Open a property's Quotes tab to start one."
        :cta="{ label: 'Browse properties', to: '/admin/properties' }"
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
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                    STATUS_TONE[w.status],
                  ]"
                  data-testid="work-order-row-status"
                  :data-status="w.status"
                >
                  {{ STATUS_LABEL[w.status] }}
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

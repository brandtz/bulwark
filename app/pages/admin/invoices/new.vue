<!--
  app/pages/admin/invoices/new.vue — top-level "+ New invoice"
  work-order picker (E14-S4).

  # Decisions (ADR-0008)
    - Invoices are billed against work orders. Per the audit, the
      org-wide invoice index had no entry point. This page lists every
      eligible WO across the org and hands off to the existing builder
      via `?workOrderId=` so the line-item pre-population still runs.
    - We list `completed` WOs by default, but the existing builder
      decision (E8-S3) is "do NOT gate on completed status" — Drew's
      walkthrough wants to invoice from any WO. So we ALSO surface a
      "Show all" toggle that drops the status filter. Default stays on
      `completed` to honor the BRD chain.
    - Pure routing surface — no mutations.

  # Decision cast down
    - Rejected: a "from scratch" invoice mode without a WO. The builder
      requires a `workOrderId` parameter to pre-fill labor + materials;
      changing it to optional would force a redesign.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { WorkOrderStatus } from '~~/shared/contracts/work-order'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'New invoice — pick a work order' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const workOrder = useService('workOrder')
const property = useService('property')
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const SCOPE_OPTIONS: { value: 'completed' | 'all'; label: string }[] = [
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
]

const scope = computed<'completed' | 'all'>(() =>
  route.query.scope === 'all' ? 'all' : 'completed',
)

function setScope(v: string) {
  router.replace({
    query: { ...route.query, scope: v === 'all' ? 'all' : undefined },
  })
}

const { data: bundle } = await useAsyncData(
  () => `invoice-picker-wos-${orgId.value}-${scope.value}`,
  async () => {
    const list = await workOrder.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 200,
      status:
        scope.value === 'completed'
          ? ('completed' as WorkOrderStatus)
          : undefined,
    })
    const propertyIds = Array.from(new Set(list.rows.map((w) => w.propertyId)))
    const propMap = new Map<string, string>()
    await Promise.all(
      propertyIds.map(async (pid) => {
        const p = await property.get(pid, orgId.value)
        if (p) propMap.set(pid, `${p.addressLine1}, ${p.city}, ${p.state}`)
      }),
    )
    return { rows: list.rows, propMap }
  },
  { server: false, watch: [orgId, scope] },
)

function builderLinkFor(propertyId: string, workOrderId: string): string {
  return `/admin/properties/${propertyId}/invoices/new?workOrderId=${encodeURIComponent(workOrderId)}`
}

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
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="invoice-wo-picker">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Invoices', to: '/admin/invoices' },
        { label: 'New invoice' },
      ]"
    />

    <header class="mt-2">
      <h1 class="text-display">New invoice</h1>
      <p class="text-body text-text-secondary mt-1">
        Invoices are billed against work orders. Pick the work order
        you're invoicing.
      </p>
    </header>

    <div class="mt-4">
      <BulwarkSegmentedControl
        :model-value="scope"
        :options="SCOPE_OPTIONS"
        aria-label="Filter by work-order status"
        data-testid="invoice-picker-scope"
        @update:model-value="setScope"
      />
    </div>

    <div v-if="!bundle || bundle.rows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No work orders match"
        body="Try the &quot;All&quot; filter, or create a work order first."
        :cta="{ label: 'Browse work orders', to: '/admin/work-orders' }"
        data-testid="invoice-picker-empty"
      />
    </div>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li
        v-for="w in bundle.rows"
        :key="w.id"
        data-testid="invoice-picker-row"
        :data-work-order-id="w.id"
      >
        <NuxtLink :to="builderLinkFor(w.propertyId, w.id)" class="block">
          <BulwarkCard padding="md" clickable>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-body font-medium text-text-primary">
                  {{ w.workOrderNumber }}
                </p>
                <p class="text-small text-text-secondary truncate">
                  {{ bundle.propMap.get(w.propertyId) ?? '—' }}
                </p>
              </div>
              <span
                :class="[
                  'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                  STATUS_TONE[w.status],
                ]"
              >
                {{ STATUS_LABEL[w.status] }}
              </span>
            </div>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

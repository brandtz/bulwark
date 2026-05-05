<!--
  app/pages/field/work-orders.vue — assigned jobs list (E10-S2).

  # Decisions (ADR-0008)
    - Mobile-first list of every WO scoped to the active org with
      a status pill + trade-slot count. No costs, no markup.
    - We don't filter by "assigned to me" because the mock has no
      field-user → WO link; in production this becomes
      `workOrder.list({ assignedToUserId: session.userId })`.

  # Decision cast down
    - Rejected: linking each row to `/admin/work-orders/[id]`.
      The persona matrix forbids field on /admin/* and rightly
      so. A field-side WO detail lands when the sponsor asks for
      one (likely Phase 2).
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.field,
})

useHead({ title: 'My jobs' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const workOrder = useService('workOrder')

const { data: rows } = await useAsyncData(
  () => `field-work-orders-${orgId.value}`,
  async () => {
    const out = await workOrder.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 200,
    })
    return out.rows.filter((w) => w.status !== 'cancelled')
  },
  { server: false, watch: [orgId] },
)

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-surface-muted text-text-secondary',
  scheduled: 'bg-status-info/10 text-status-info',
  in_progress: 'bg-status-warning/10 text-status-warning',
  completed: 'bg-status-success/10 text-status-success',
  cancelled: 'bg-status-error/10 text-status-error',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-work-orders">
    <header>
      <h1 class="text-display">My jobs</h1>
      <p class="text-body text-text-secondary mt-1">
        Active work orders across your sites.
      </p>
    </header>

    <BulwarkCard
      v-if="!rows || rows.length === 0"
      padding="md"
      class="mt-4"
    >
      <p class="text-body text-text-secondary" data-testid="field-work-orders-empty">
        No jobs in flight right now.
      </p>
    </BulwarkCard>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li v-for="w in rows" :key="w.id" data-testid="field-work-order-row">
        <BulwarkCard padding="md">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-body font-medium">{{ w.workOrderNumber }}</p>
              <p class="text-small text-text-secondary mt-1">
                {{ w.tradeSlots.length }} trade slot(s) · scheduled
                {{ formatDate(w.scheduledStart) }}
              </p>
            </div>
            <span
              :class="[
                'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                STATUS_TONE[w.status] ?? 'bg-surface-muted text-text-secondary',
              ]"
            >
              {{ STATUS_LABEL[w.status] ?? w.status }}
            </span>
          </div>
        </BulwarkCard>
      </li>
    </ul>
  </div>
</template>

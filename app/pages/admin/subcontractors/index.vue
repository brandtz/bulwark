<!--
  app/pages/admin/subcontractors/index.vue — subcontractor list (E6-S1).

  # Decisions (ADR-0008)
    - Minimal v1: list cards with company, contact, trade chips. The
      sidebar already advertises this route, so the page must exist or
      we ship a broken nav link. Detail + create flow lands in E6-S5.
    - `{ server: false }` to stay aligned with the rest of the admin
      shell. Even though subs are read-only seeded fixtures today,
      future create lands in the same module instance.

  # Decision cast down
    - Rejected: building the full create/edit form here. Out of scope
      for S1; the story is "wire the work-order data path" and the
      list is just enough surface to validate the service.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { TRADE_LABEL } from '~~/shared/contracts/subcontractor'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Subcontractors' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const subcontractor = useService('subcontractor')
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: bundle } = await useAsyncData(
  () => `subcontractors-${orgId.value}`,
  async () => {
    const list = await subcontractor.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 100,
    })
    return { rows: list.rows, total: list.total }
  },
  { server: false, watch: [orgId] },
)
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="subcontractors-list">
    <header>
      <h1 class="text-display">Subcontractors</h1>
      <p class="text-body text-text-secondary mt-1">
        {{ bundle?.total ?? 0 }}
        {{ (bundle?.total ?? 0) === 1 ? 'subcontractor' : 'subcontractors' }}
      </p>
    </header>

    <div v-if="!bundle || bundle.rows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No subcontractors yet"
        body="Subcontractor management lands fully in the next wave. The seed list will appear here."
        data-testid="subcontractors-empty"
      />
    </div>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li
        v-for="s in bundle.rows"
        :key="s.id"
        data-testid="subcontractor-row"
      >
        <BulwarkCard padding="md">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-body font-medium text-text-primary" data-testid="subcontractor-row-name">
                {{ s.companyName }}
              </p>
              <p class="text-small text-text-secondary">
                {{ s.contactName }} · {{ s.phone }}
              </p>
            </div>
            <div class="flex flex-wrap gap-1.5" data-testid="subcontractor-row-trades">
              <span
                v-for="t in s.trades"
                :key="t"
                class="inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium bg-surface-muted text-text-secondary whitespace-nowrap"
              >
                {{ TRADE_LABEL[t] }}
              </span>
            </div>
          </div>
        </BulwarkCard>
      </li>
    </ul>
  </div>
</template>

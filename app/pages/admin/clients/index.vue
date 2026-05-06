<!--
  app/pages/admin/clients/index.vue — clients list (E3-S6).

  # Decisions (ADR-0008)
    - Lightweight list-only page (matches the property pipeline shape without
      the kanban). Search + pagination land later when the customer file
      grows past a screen — for now we just render the rows so the
      sidebar's "Clients" link doesn't 404.
    - Server-rendered through `useAsyncData` keyed on `clients-${orgId}`
      so the tenant firewall (E2-S7) gates the call automatically.

  # Decision cast down
    - Rejected: full filter chips on day one. The fixture is small and the
      real filter UX needs intake-from-CSV + lifecycle stage tags first.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Clients — Bulwark' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const client = useService('client')

const { data: list } = await useAsyncData(
  () => `clients-${orgId.value}`,
  () => client.list({ organizationId: orgId.value, page: 1, pageSize: 100 }),
  {
    watch: [orgId],
    default: () => ({ rows: [], total: 0, page: 1, pageSize: 100 }),
  },
)
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="clients-list">
    <header class="flex items-center justify-between gap-3 mb-6">
      <div>
        <h1 class="text-display">Clients</h1>
        <p class="text-body text-text-secondary mt-1">
          {{ list?.total ?? 0 }} {{ (list?.total ?? 0) === 1 ? 'client' : 'clients' }} on file.
        </p>
      </div>
      <NuxtLink
        to="/admin/clients/new"
        data-testid="new-client-button"
        class="inline-flex items-center justify-center rounded-input bg-primary text-white text-body font-medium px-4 h-input hover:bg-primary-hover transition-colors"
      >
        + New client
      </NuxtLink>
    </header>

    <BulwarkCard padding="none">
      <ul class="divide-y divide-border">
        <li
          v-for="row in list?.rows ?? []"
          :key="row.id"
          data-testid="client-row"
        >
          <NuxtLink
            :to="`/admin/clients/${row.id}`"
            class="flex items-center justify-between p-4 hover:bg-surface-muted transition"
          >
            <div class="min-w-0">
              <p class="text-body font-medium truncate">{{ row.fullName }}</p>
              <p class="text-small text-text-secondary truncate">
                {{ row.email ?? '—' }} · {{ row.phone }}
              </p>
            </div>
            <span class="text-small text-text-secondary">View →</span>
          </NuxtLink>
        </li>
      </ul>
      <EmptyState
        v-if="(list?.rows ?? []).length === 0"
        icon="·"
        title="No clients yet"
        body="Add a client directly, or create one inline from the property intake form."
        :cta="{ label: 'New client', to: '/admin/clients/new' }"
        data-testid="clients-empty"
      />
    </BulwarkCard>
  </div>
</template>

<!--
  app/pages/admin/clients/[id].vue — client detail (E3-S6).

  # Decisions (ADR-0008)
    - Single-page detail (no tabs). A client's only related domain right
      now is "their properties" — when invoicing history (E9) and
      messaging (E10) land we'll graduate to a tabbed shell similar to
      the property hub.
    - Properties owned by this client are fetched as a SECOND list call
      filtered client-side. The contract has `PropertyListInputSchema`
      with `search` only — adding a `clientId` filter is a back-compat
      change and not needed yet at fixture scale.
    - 404 surface mirrors the property hub: never throw, render an
      `EmptyState` with a back link.

  # Decision cast down
    - Rejected: inline edit. We'll add edit when the field team starts
      asking for it (probably in E4 when call-prep flows light up).
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()

const clientId = computed(() => String(route.params.id))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const clientService = useService('client')
const propertyService = useService('property')

const { data: detail } = await useAsyncData(
  () => `client-detail-${clientId.value}-${orgId.value}`,
  async () => {
    const c = await clientService.get(clientId.value, orgId.value)
    if (!c) return { client: null, properties: [] }
    // Fixture-scale: list everything and filter to this client.
    const list = await propertyService.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 200,
    })
    const properties = list.rows.filter((p) => p.clientId === c.id)
    return { client: c, properties }
  },
  { watch: [clientId, orgId] },
)

useHead(() => ({
  title: detail.value?.client
    ? `${detail.value.client.fullName} — Bulwark`
    : 'Client — Bulwark',
}))

const preferredContactLabel: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  sms: 'SMS',
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="client-detail">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Clients', to: '/admin/clients' },
        { label: detail?.client?.fullName ?? 'Not found' },
      ]"
    />

    <template v-if="!detail?.client">
      <EmptyState
        icon="·"
        title="Client not found"
        body="They may have been removed, or you don't have access."
        :cta="{ label: 'Back to clients', to: '/admin/clients' }"
        data-testid="client-not-found"
      />
    </template>

    <template v-else>
      <header class="mt-2">
        <h1 class="text-display" data-testid="client-name">
          {{ detail.client.fullName }}
        </h1>
        <p class="text-body text-text-secondary mt-1">
          {{ detail.client.email ?? '—' }} · {{ detail.client.phone }}
          <span v-if="detail.client.preferredContact" class="ml-2 text-small">
            (Prefers {{ preferredContactLabel[detail.client.preferredContact] ?? detail.client.preferredContact }})
          </span>
        </p>
      </header>

      <section class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <BulwarkCard padding="md">
          <h2 class="text-h2 mb-2">Contact</h2>
          <dl class="text-body grid grid-cols-[8rem_1fr] gap-y-1">
            <dt class="text-text-secondary">Email</dt>
            <dd>{{ detail.client.email ?? '—' }}</dd>
            <dt class="text-text-secondary">Phone</dt>
            <dd>{{ detail.client.phone }}</dd>
            <dt class="text-text-secondary">Prefers</dt>
            <dd>{{ detail.client.preferredContact ? (preferredContactLabel[detail.client.preferredContact] ?? detail.client.preferredContact) : '—' }}</dd>
          </dl>
        </BulwarkCard>

        <BulwarkCard v-if="detail.client.notes" padding="md">
          <h2 class="text-h2 mb-2">Notes</h2>
          <p class="text-body whitespace-pre-line">{{ detail.client.notes }}</p>
        </BulwarkCard>
      </section>

      <section class="mt-8" data-testid="client-properties">
        <h2 class="text-h2 mb-3">Properties</h2>
        <BulwarkCard v-if="detail.properties.length > 0" padding="none">
          <ul class="divide-y divide-border">
            <li
              v-for="p in detail.properties"
              :key="p.id"
              data-testid="client-property-row"
            >
              <NuxtLink
                :to="`/admin/properties/${p.id}`"
                class="flex items-center justify-between p-4 hover:bg-surface-muted transition gap-3"
              >
                <div class="min-w-0">
                  <p class="text-body font-medium truncate">{{ p.addressLine1 }}</p>
                  <p class="text-small text-text-secondary">
                    {{ p.city }}, {{ p.state }} {{ p.postalCode }}
                  </p>
                </div>
                <StatusBadge :status="p.status" />
              </NuxtLink>
            </li>
          </ul>
        </BulwarkCard>
        <EmptyState
          v-else
          icon="·"
          title="No properties for this client yet"
          body="Properties get linked to a client during intake."
          data-testid="client-no-properties"
        />
      </section>
    </template>
  </div>
</template>

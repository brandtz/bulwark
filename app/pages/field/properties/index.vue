<!--
  app/pages/field/properties/index.vue — properties list for field GC (E10-S5).

  # Decisions (ADR-0008)
    - Mobile-first single-column list. We deliberately drop the
      kanban + list-toggle that admins get; field users just want
      a tappable list of every active site.
    - No financial columns. Status pill + address + city only.

  # Decision cast down
    - Rejected: filtering to only the properties this field user
      has assessed. The mock has no field-user → property
      assignment, and Drew's value here is "give me a clipboard
      of every site in flight" anyway.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.field,
})

useHead({ title: 'My properties' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const property = useService('property')

const { data: rows } = await useAsyncData(
  () => `field-properties-${orgId.value}`,
  async () => {
    const out = await property.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 200,
    })
    return out.rows.filter((p) => p.status !== 'cancelled')
  },
  { server: false, watch: [orgId] },
)
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-properties">
    <header>
      <h1 class="text-display">My properties</h1>
      <p class="text-body text-text-secondary mt-1">
        Tap a site to start or review an assessment.
      </p>
    </header>

    <BulwarkCard
      v-if="!rows || rows.length === 0"
      padding="md"
      class="mt-4"
    >
      <p class="text-body text-text-secondary" data-testid="field-properties-empty">
        Nothing assigned yet.
      </p>
    </BulwarkCard>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li v-for="p in rows" :key="p.id" data-testid="field-property-row">
        <NuxtLink :to="`/field/properties/${p.id}`" class="block">
          <BulwarkCard padding="md" clickable>
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-body font-medium truncate">{{ p.addressLine1 }}</p>
                <p class="text-small text-text-secondary truncate">
                  {{ p.city }}, {{ p.state }}
                </p>
              </div>
              <StatusBadge :status="p.status" />
            </div>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

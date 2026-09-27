<!--
  app/pages/homeowner/properties.vue — list of the homeowner's
  properties (W3-4 / EH-O / ADR-0032). Read via the self-scoped
  homeowner.listMyProperties (WP-L07).
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'homeowner',
  middleware: ['role', 'homeowner-role'],
  requiredRoles: ROLE_GROUPS.homeowner,
})

useHead({ title: 'My properties' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const homeowner = useService('homeowner')

const { data: rows } = await useAsyncData(
  () => `ho-props-${orgId.value}-${userId.value}`,
  async () => {
    if (!orgId.value || !userId.value) return []
    // WP-L07: self-scoped on the server; portal roles cannot call the staff property service.
    return await homeowner.listMyProperties(orgId.value)
  },
  { server: false, watch: [orgId, userId] },
)
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="homeowner-properties">
    <h1 class="text-display">My properties</h1>

    <ul v-if="rows && rows.length" class="mt-4 space-y-2">
      <li v-for="row in rows" :key="row.id" :data-testid="`ho-property-${row.id}`">
        <BulwarkCard padding="md">
          <p class="text-body font-medium">{{ row.addressLine1 }}</p>
          <p class="text-small text-text-secondary mt-1">
            {{ row.city }}, {{ row.state }} {{ row.postalCode }}
          </p>
        </BulwarkCard>
      </li>
    </ul>
    <EmptyState
      v-else
      data-testid="ho-properties-empty"
      title="No properties yet"
      body="Your contractor will share property details here once they're added."
    />
  </div>
</template>

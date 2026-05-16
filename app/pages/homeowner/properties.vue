<!--
  app/pages/homeowner/properties.vue — list of the homeowner's
  properties (W3-4 / EH-O / ADR-0032). Read via homeowner.listForUser
  + property.get per row.
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
const property = useService('property')

const { data: rows } = await useAsyncData(
  () => `ho-props-${orgId.value}-${userId.value}`,
  async () => {
    if (!orgId.value || !userId.value) return []
    const memberships = await homeowner.listForUser(userId.value, orgId.value)
    const props = await Promise.all(
      memberships.map((m) => property.get(m.propertyId, orgId.value)),
    )
    return props.filter((p): p is NonNullable<typeof p> => p !== null)
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

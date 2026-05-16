<!--
  app/pages/homeowner/quotes.vue — list quotes scoped to the
  homeowner's properties (W3-4 / EH-O / ADR-0032). Opening a quote
  navigates to /homeowner/quotes/[id] which emits
  `homeowner.quote_viewed` on first paint.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'homeowner',
  middleware: ['role', 'homeowner-role'],
  requiredRoles: ROLE_GROUPS.homeowner,
})

useHead({ title: 'My quotes' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const homeowner = useService('homeowner')
const quote = useService('quote')

const { data: rows } = await useAsyncData(
  () => `ho-quotes-${orgId.value}-${userId.value}`,
  async () => {
    if (!orgId.value || !userId.value) return []
    const memberships = await homeowner.listForUser(userId.value, orgId.value)
    const propertyIds = new Set(memberships.map((m) => m.propertyId))
    const out = await quote.list({ organizationId: orgId.value, page: 1, pageSize: 100 })
    return out.rows.filter((q) => propertyIds.has(q.propertyId))
  },
  { server: false, watch: [orgId, userId] },
)
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="homeowner-quotes">
    <h1 class="text-display">My quotes</h1>

    <ul v-if="rows && rows.length" class="mt-4 space-y-2">
      <li v-for="row in rows" :key="row.id" :data-testid="`ho-quote-${row.id}`">
        <NuxtLink :to="`/homeowner/quotes/${row.id}`">
          <BulwarkCard padding="md">
            <p class="text-body font-medium">{{ row.quoteNumber }}</p>
            <p class="text-small text-text-secondary mt-1">{{ row.status }}</p>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
    <EmptyState
      v-else
      data-testid="ho-quotes-empty"
      title="No quotes yet"
      body="Your contractor will share quotes here once they're sent."
    />
  </div>
</template>

<!--
  app/pages/homeowner/invoices.vue — invoices scoped to the
  homeowner's properties (W3-4 / EH-O / ADR-0032).
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'homeowner',
  middleware: ['role', 'homeowner-role'],
  requiredRoles: ROLE_GROUPS.homeowner,
})

useHead({ title: 'My invoices' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const homeowner = useService('homeowner')

const { data: rows } = await useAsyncData(
  () => `ho-invoices-${orgId.value}-${userId.value}`,
  async () => {
    if (!orgId.value || !userId.value) return []
    // WP-L07: the server returns only this homeowner's non-draft invoices.
    return await homeowner.listMyInvoices(orgId.value)
  },
  { server: false, watch: [orgId, userId] },
)

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="homeowner-invoices">
    <h1 class="text-display">My invoices</h1>

    <ul v-if="rows && rows.length" class="mt-4 space-y-2">
      <li v-for="row in rows" :key="row.id" :data-testid="`ho-invoice-${row.id}`">
        <NuxtLink :to="`/homeowner/invoices/${row.id}`">
          <BulwarkCard padding="md">
            <p class="text-body font-medium">{{ row.invoiceNumber }}</p>
            <p class="text-small text-text-secondary mt-1">
              {{ row.status }} · {{ dollars(row.totals.totalCents) }}
            </p>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
    <EmptyState
      v-else
      data-testid="ho-invoices-empty"
      title="No invoices yet"
      body="Your contractor will share invoices here once they're issued."
    />
  </div>
</template>

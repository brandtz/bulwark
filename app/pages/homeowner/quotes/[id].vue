<!--
  app/pages/homeowner/quotes/[id].vue — read-only quote detail for
  homeowner portal (W3-4 / W4-1 / EH-O).

  # Decisions
    - Single network call to `/api/homeowner/quotes/:id/viewed` on
      mount emits `homeowner.quote_viewed` server-side. Doing this on
      the server (rather than the client emitting directly) keeps the
      tenant firewall + audit trail honest.
    - Re-fetches the quote through `useService('quote').get` because
      the homeowner middleware has already verified property
      membership; the service layer does its own org scoping.

  # Decision cast down
    - Inline downloadable PDF link. Punted — Phase 1 has no PDF
      pipeline. Listed in W4-2 follow-ups.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'homeowner',
  middleware: ['role', 'homeowner-role'],
  requiredRoles: ROLE_GROUPS.homeowner,
})

const route = useRoute()
const quoteId = computed(() => String(route.params.id ?? ''))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const quoteService = useService('quote')

const { data: quote } = await useAsyncData(
  () => `ho-quote-${quoteId.value}-${orgId.value}`,
  async () => {
    if (!orgId.value || !quoteId.value) return null
    return await quoteService.get(quoteId.value, orgId.value)
  },
  { server: false, watch: [quoteId, orgId] },
)

useHead({ title: () => (quote.value ? `Quote ${quote.value.quoteNumber}` : 'Quote') })

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

onMounted(async () => {
  if (!quoteId.value) return
  try {
    await $fetch(`/api/homeowner/quotes/${quoteId.value}/viewed`, { method: 'POST' })
  } catch {
    // View-event emission is best-effort; never block the page.
  }
})
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="homeowner-quote-detail">
    <div v-if="quote">
      <h1 class="text-display" data-testid="ho-quote-number">{{ quote.quoteNumber }}</h1>
      <p class="text-small text-text-secondary mt-1">{{ quote.status }}</p>

      <BulwarkCard padding="md" class="mt-4">
        <p class="text-h2">Total</p>
        <p class="text-display mt-1" data-testid="ho-quote-total">{{ dollars(quote.totals.totalCents) }}</p>
      </BulwarkCard>

      <h2 class="text-h2 mt-6">Line items</h2>
      <ul class="mt-2 space-y-2">
        <li
          v-for="li in quote.lineItems"
          :key="li.id"
          class="rounded-card border border-border bg-surface px-3 py-2"
          data-testid="ho-quote-line"
        >
          <p class="text-body">{{ li.description }}</p>
          <p class="text-small text-text-secondary mt-1">
            {{ li.quantity }} × {{ dollars(li.unitCostCents) }}
          </p>
        </li>
      </ul>
    </div>
    <EmptyState
      v-else
      data-testid="ho-quote-empty"
      title="Quote not found"
      body="This quote may have been removed or is not visible to you."
    />
  </div>
</template>

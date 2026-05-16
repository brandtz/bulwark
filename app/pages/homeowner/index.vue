<!--
  app/pages/homeowner/index.vue — homeowner portal landing page
  (W3-4 / EH-O / ADR-0032).

  Shows a friendly hello + count of properties, quotes, invoices, and
  quick links into the three deeper screens. All data via useService()
  so the tenant firewall scopes rows server-side.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'homeowner',
  middleware: ['role', 'homeowner-role'],
  requiredRoles: ROLE_GROUPS.homeowner,
})

useHead({ title: 'Home' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const homeowner = useService('homeowner')
const quote = useService('quote')
const invoice = useService('invoice')

const { data: bag } = await useAsyncData(
  () => `ho-home-${orgId.value}-${userId.value}`,
  async () => {
    if (!orgId.value || !userId.value) return { properties: 0, quotes: 0, invoices: 0 }
    const memberships = await homeowner.listForUser(userId.value, orgId.value)
    const propertyIds = memberships.map((m) => m.propertyId)
    // Quote/invoice counts: list and filter to the homeowner's properties.
    const [quotes, invoices] = await Promise.all([
      quote.list({ organizationId: orgId.value, page: 1, pageSize: 100 }),
      invoice.list({ organizationId: orgId.value, page: 1, pageSize: 100 }),
    ])
    return {
      properties: propertyIds.length,
      quotes: quotes.rows.filter((q) => propertyIds.includes(q.propertyId)).length,
      invoices: invoices.rows.filter((i) => propertyIds.includes(i.propertyId)).length,
    }
  },
  { server: false, watch: [orgId, userId] },
)

const today = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="homeowner-home">
    <header>
      <p class="text-small text-text-secondary">{{ today }}</p>
      <h1 class="text-display mt-1">
        Hi, {{ session?.fullName?.split(' ')[0] ?? 'there' }}
      </h1>
      <p class="text-body text-text-secondary mt-1">Here's what's happening with your home.</p>
    </header>

    <section class="mt-4 grid grid-cols-3 gap-3" data-testid="homeowner-kpis">
      <BulwarkCard padding="md">
        <p class="text-tiny uppercase text-text-secondary">Properties</p>
        <p class="text-display mt-1">{{ bag?.properties ?? 0 }}</p>
      </BulwarkCard>
      <BulwarkCard padding="md">
        <p class="text-tiny uppercase text-text-secondary">Quotes</p>
        <p class="text-display mt-1">{{ bag?.quotes ?? 0 }}</p>
      </BulwarkCard>
      <BulwarkCard padding="md">
        <p class="text-tiny uppercase text-text-secondary">Invoices</p>
        <p class="text-display mt-1">{{ bag?.invoices ?? 0 }}</p>
      </BulwarkCard>
    </section>

    <section class="mt-6 space-y-3">
      <NuxtLink to="/homeowner/properties" class="block">
        <BulwarkCard padding="md">My properties →</BulwarkCard>
      </NuxtLink>
      <NuxtLink to="/homeowner/quotes" class="block">
        <BulwarkCard padding="md">My quotes →</BulwarkCard>
      </NuxtLink>
      <NuxtLink to="/homeowner/invoices" class="block">
        <BulwarkCard padding="md">My invoices →</BulwarkCard>
      </NuxtLink>
    </section>
  </div>
</template>

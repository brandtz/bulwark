<!--
  app/pages/admin/quotes/new.vue — top-level "+ New quote" property
  picker (E14-S2).

  # Decisions (ADR-0008)
    - Quotes can only exist under a property (BRD chain Property → Quote
      → WO → Invoice). Sponsor's complaint was that the quotes index
      had no entry point to *start* one — they had to know to navigate
      to a property first. This page closes that gap by offering an
      org-wide property picker that hands off to the existing
      `/admin/properties/[id]/quotes/new` builder.
    - Pure routing surface. We do NOT mutate any quote state here; the
      picker just navigates. That keeps the contract surface unchanged
      and lets the existing quote-builder spec keep covering the
      authoring flow.
    - `?search=` query string + a single search box, no filters. The
      property pipeline already exposes status filters; if the user
      wants to narrow by status they can navigate via the pipeline.

  # Decision cast down
    - Rejected: an inline modal on the quotes index that picks a
      property and posts straight to `quote.create()`. That bypasses
      the assessment-driven pre-populator (E5-S2) which is the whole
      reason the builder lives under a property.
    - Rejected: a server-side property search via the contract. The
      contract has `search` only — adding a `hasAcceptedAssessment`
      filter is not needed for v1; client-side substring is fine
      at fixture scale.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'New quote — pick a property' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const property = useService('property')
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const search = ref(String(route.query.search ?? ''))
watch(search, (v) => {
  router.replace({ query: { ...route.query, search: v || undefined } })
})

const { data: list } = await useAsyncData(
  () => `quote-picker-properties-${orgId.value}`,
  () => property.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
  {
    server: false,
    watch: [orgId],
    default: () => ({ rows: [], total: 0, page: 1, pageSize: 200 }),
  },
)

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  const rows = list.value?.rows ?? []
  if (!q) return rows
  return rows.filter((p) => {
    const blob = `${p.addressLine1} ${p.city} ${p.state} ${p.postalCode}`.toLowerCase()
    return blob.includes(q)
  })
})

function builderLinkFor(propertyId: string): string {
  return `/admin/properties/${propertyId}/quotes/new`
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="quote-property-picker">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Quotes', to: '/admin/quotes' },
        { label: 'New quote' },
      ]"
    />

    <header class="mt-2">
      <h1 class="text-display">New quote</h1>
      <p class="text-body text-text-secondary mt-1">
        Quotes belong to a property. Pick the property you're quoting for.
      </p>
    </header>

    <div class="mt-4">
      <BulwarkInput
        v-model="search"
        label="Find a property"
        placeholder="Address, city, ZIP…"
        data-testid="quote-picker-search"
      />
    </div>

    <div v-if="filteredRows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No properties match"
        body="Properties are created from the pipeline. Add one, then start a quote."
        :cta="{ label: 'Add a property', to: '/admin/properties/new' }"
        data-testid="quote-picker-empty"
      />
    </div>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li
        v-for="p in filteredRows"
        :key="p.id"
        data-testid="quote-picker-row"
        :data-property-id="p.id"
      >
        <NuxtLink :to="builderLinkFor(p.id)" class="block">
          <BulwarkCard padding="md" clickable>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-body font-medium text-text-primary">
                  {{ p.addressLine1 }}
                </p>
                <p class="text-small text-text-secondary truncate">
                  {{ p.city }}, {{ p.state }} {{ p.postalCode }}
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

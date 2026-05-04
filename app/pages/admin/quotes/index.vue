<!--
  app/pages/admin/quotes/index.vue — quotes list (E5-S4).

  # Decisions (ADR-0008)
    - Org-wide list of quotes with status filters. The sidebar already
      links here (`/admin/quotes` was registered in nav.config.ts on
      day one); this finally fills the page.
    - Filter via `?status=` query param so deep-links (e.g. "show me
      every accepted quote") survive sharing + reload. `BulwarkSegmentedControl`
      drives the param; `useAsyncData` keys on it.
    - `{ server: false }` on the asyncData. The quotes mock module
      lives client-side (created via the builder), so SSR has no rows.
      We surface empty-state on the first paint and let the client
      fetch backfill once hydrated.
    - Each row links to the existing preview page at
      `/admin/properties/[propertyId]/quotes/[id]`. The full property
      address is resolved via a parallel property fetch \u2014 the mock
      list is small enough that one fetch per visible quote is fine
      for v1; the server impl will join in SQL later.
    - Mobile-first: each quote is a vertical card. \u2265md the cards
      align in a single column with more horizontal info. Pagination
      lands when the fixture set grows past 50 (E5-S5 won't need it).

  # Decision cast down
    - Rejected: a property-name search box. Filters by status are the
      only real ask from Drew right now; full search lives in E10.
    - Rejected: bulk actions (multi-select \u2192 mark sent). No demo
      story exercises it; defer until a real customer asks.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { formatCents } from '~~/shared/utils/money'
import type { Quote, QuoteStatus } from '~~/shared/contracts/quote'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Quotes' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const quote = useService('quote')
const property = useService('property')

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const STATUS_FILTERS: { value: 'all' | QuoteStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
]

const STATUS_TONE: Record<QuoteStatus, string> = {
  draft: 'bg-surface-muted text-text-secondary',
  sent: 'bg-status-info/10 text-status-info',
  accepted: 'bg-status-success/10 text-status-success',
  rejected: 'bg-status-error/10 text-status-error',
  expired: 'bg-surface-muted text-text-disabled',
}

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
}

const activeFilter = computed<'all' | QuoteStatus>(() => {
  const q = String(route.query.status ?? 'all')
  return STATUS_FILTERS.some((f) => f.value === q)
    ? (q as 'all' | QuoteStatus)
    : 'all'
})

function setFilter(v: string) {
  router.push({ query: { ...route.query, status: v === 'all' ? undefined : v } })
}

const { data: bundle } = await useAsyncData(
  () => `quotes-list-${orgId.value}-${activeFilter.value}`,
  async () => {
    const list = await quote.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 100,
      status:
        activeFilter.value === 'all' ? undefined : (activeFilter.value as QuoteStatus),
    })
    // Resolve unique property ids in one shot for address rendering.
    const propertyIds = Array.from(new Set(list.rows.map((q) => q.propertyId)))
    const propMap = new Map<string, string>()
    await Promise.all(
      propertyIds.map(async (pid) => {
        const p = await property.get(pid, orgId.value)
        if (p) propMap.set(pid, `${p.addressLine1}, ${p.city}, ${p.state}`)
      }),
    )
    return { rows: list.rows, total: list.total, propMap }
  },
  { server: false, watch: [orgId, activeFilter] },
)

function addressFor(q: Quote): string {
  return bundle.value?.propMap.get(q.propertyId) ?? ''
}

function previewLinkFor(q: Quote): string {
  return `/admin/properties/${q.propertyId}/quotes/${q.id}`
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="quotes-list">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-display">Quotes</h1>
        <p class="text-body text-text-secondary mt-1">
          {{ bundle?.total ?? 0 }} {{ (bundle?.total ?? 0) === 1 ? 'quote' : 'quotes' }}
          <span v-if="activeFilter !== 'all'"> · {{ STATUS_LABEL[activeFilter as QuoteStatus] }}</span>
        </p>
      </div>
    </header>

    <div class="mt-4">
      <BulwarkSegmentedControl
        :model-value="activeFilter"
        :options="STATUS_FILTERS"
        aria-label="Filter quotes by status"
        data-testid="quote-status-filter"
        @update:model-value="setFilter"
      />
    </div>

    <div v-if="!bundle || bundle.rows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No quotes here yet"
        body="Build the first quote from a property's Quotes tab."
        :cta="{ label: 'Browse properties', to: '/admin/properties' }"
        data-testid="quotes-empty"
      />
    </div>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li
        v-for="q in bundle.rows"
        :key="q.id"
        data-testid="quote-row"
      >
        <NuxtLink
          :to="previewLinkFor(q)"
          class="block"
        >
          <BulwarkCard padding="md" clickable>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-body font-medium text-text-primary" data-testid="quote-row-number">
                  {{ q.quoteNumber }}
                </p>
                <p
                  v-if="addressFor(q)"
                  class="text-small text-text-secondary truncate"
                  data-testid="quote-row-address"
                >
                  {{ addressFor(q) }}
                </p>
              </div>
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                    STATUS_TONE[q.status],
                  ]"
                  data-testid="quote-row-status"
                  :data-status="q.status"
                >
                  {{ STATUS_LABEL[q.status] }}
                </span>
                <span class="text-body font-medium" data-testid="quote-row-total">
                  {{ formatCents(q.totals.totalCents) }}
                </span>
              </div>
            </div>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

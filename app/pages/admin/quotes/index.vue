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
import type { Quote, QuoteStatus, QuoteTier } from '~~/shared/contracts/quote'

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
const { t: tLabel } = useLabel()

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
function statusCopy(s: QuoteStatus): string {
  return tLabel('status.quote', s, STATUS_LABEL[s])
}
function tierCopy(t: QuoteTier): string {
  return tLabel('quote.tiers', t, t.charAt(0).toUpperCase() + t.slice(1))
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

// W4-1 / EH-P — saved-views integration. The page state we persist is
// just the active status filter today; future filters append here.
const currentFilters = computed(() => ({ status: activeFilter.value }))
function applySavedView(payload: { filters: Record<string, unknown> }) {
  const next = typeof payload.filters?.status === 'string' ? payload.filters.status : 'all'
  setFilter(next)
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

// W2-3b — group rows by revisionGroupId; latest revision is the head.
// Rows without a revisionGroupId form a singleton group keyed on id.
interface QuoteGroup {
  key: string
  head: Quote
  predecessors: Quote[]
}
const groups = computed<QuoteGroup[]>(() => {
  const rows = bundle.value?.rows ?? []
  const byKey = new Map<string, Quote[]>()
  for (const q of rows) {
    const k = q.revisionGroupId ?? q.id
    const arr = byKey.get(k) ?? []
    arr.push(q)
    byKey.set(k, arr)
  }
  const out: QuoteGroup[] = []
  for (const [key, arr] of byKey.entries()) {
    const sorted = arr
      .slice()
      .sort((a, b) => (b.revisionNumber ?? 1) - (a.revisionNumber ?? 1))
    const [head, ...rest] = sorted
    if (head) out.push({ key, head, predecessors: rest })
  }
  return out.sort((a, b) => (a.head.quoteNumber < b.head.quoteNumber ? 1 : -1))
})

const expanded = ref<Set<string>>(new Set())
function toggleExpand(k: string) {
  const s = new Set(expanded.value)
  if (s.has(k)) s.delete(k)
  else s.add(k)
  expanded.value = s
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
      <NuxtLink
        to="/admin/quotes/new"
        data-testid="new-quote-button"
        class="inline-flex items-center justify-center rounded-input bg-primary text-white text-body font-medium px-4 h-input hover:bg-primary-hover transition-colors"
      >
        + New quote
      </NuxtLink>
    </header>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
      <BulwarkSegmentedControl
        :model-value="activeFilter"
        :options="STATUS_FILTERS"
        aria-label="Filter quotes by status"
        data-testid="quote-status-filter"
        @update:model-value="setFilter"
      />
      <SavedViewsMenu
        entity-type="quote"
        :current-filters="currentFilters"
        @apply="applySavedView"
      />
    </div>

    <div v-if="!bundle" class="mt-6" data-testid="quotes-loading">
      <!-- W2-6 / EH-L: shimmer rows during the client-side fetch. -->
      <BulwarkTableSkeleton :rows="6" :cols="4" />
    </div>

    <div v-else-if="bundle.rows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No quotes here yet"
        body="Build the first quote from a property's Quotes tab — or pick a property below."
        :cta="{ label: 'New quote', to: '/admin/quotes/new' }"
        data-testid="quotes-empty"
      />
    </div>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li
        v-for="g in groups"
        :key="g.key"
        data-testid="quote-row"
        :data-revision-group-id="g.head.revisionGroupId ?? g.head.id"
      >
        <div class="flex items-stretch gap-2">
          <button
            v-if="g.predecessors.length > 0"
            type="button"
            class="w-6 shrink-0 text-text-secondary hover:text-text-primary"
            :aria-label="expanded.has(g.key) ? 'Collapse revisions' : 'Expand revisions'"
            :data-testid="`quote-row-toggle`"
            :data-expanded="expanded.has(g.key) ? 'true' : 'false'"
            @click="toggleExpand(g.key)"
          >
            {{ expanded.has(g.key) ? '▾' : '▸' }}
          </button>
          <span v-else class="w-6 shrink-0" aria-hidden="true" />
          <NuxtLink :to="previewLinkFor(g.head)" class="block flex-1">
            <BulwarkCard padding="md" clickable>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-body font-medium text-text-primary" data-testid="quote-row-number">
                    {{ g.head.quoteNumber }}
                    <span
                      v-if="(g.head.revisionNumber ?? 1) > 1"
                      class="ml-1 text-tiny text-text-secondary"
                      data-testid="quote-row-revision"
                    >v{{ g.head.revisionNumber }}</span>
                  </p>
                  <p
                    v-if="addressFor(g.head)"
                    class="text-small text-text-secondary truncate"
                    data-testid="quote-row-address"
                  >
                    {{ addressFor(g.head) }}
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  <span
                    class="inline-flex items-center rounded-pill bg-primary/10 text-primary px-2 py-0.5 text-tiny font-medium whitespace-nowrap"
                    data-testid="quote-row-tier"
                    :data-tier="g.head.tier ?? 'custom'"
                  >
                    {{ tierCopy(g.head.tier ?? 'custom') }}
                  </span>
                  <span
                    :class="[
                      'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                      STATUS_TONE[g.head.status],
                    ]"
                    data-testid="quote-row-status"
                    :data-status="g.head.status"
                  >
                    {{ statusCopy(g.head.status) }}
                  </span>
                  <span class="text-body font-medium" data-testid="quote-row-total">
                    {{ formatCents(g.head.totals.totalCents) }}
                  </span>
                </div>
              </div>
            </BulwarkCard>
          </NuxtLink>
        </div>
        <ul
          v-if="expanded.has(g.key) && g.predecessors.length > 0"
          class="ml-8 mt-2 flex flex-col gap-2"
          data-testid="quote-revisions"
        >
          <li
            v-for="prev in g.predecessors"
            :key="prev.id"
            data-testid="quote-row-predecessor"
          >
            <NuxtLink :to="previewLinkFor(prev)" class="block">
              <BulwarkCard padding="sm" clickable>
                <div class="flex flex-wrap items-center justify-between gap-2 text-small">
                  <span>
                    {{ prev.quoteNumber }}
                    <span class="text-text-secondary ml-1">v{{ prev.revisionNumber ?? 1 }}</span>
                  </span>
                  <span
                    :class="[
                      'inline-flex items-center rounded-pill px-2 py-0.5 text-tiny font-medium',
                      STATUS_TONE[prev.status],
                    ]"
                  >{{ statusCopy(prev.status) }}</span>
                  <span class="text-text-secondary">{{ formatCents(prev.totals.totalCents) }}</span>
                </div>
              </BulwarkCard>
            </NuxtLink>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

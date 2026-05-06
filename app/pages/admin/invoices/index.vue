<!--
  app/pages/admin/invoices/index.vue — invoices list (E8-S1).

  # Decisions (ADR-0008)
    - Org-wide list with `?status=` filters mirroring the quotes list
      shape so the sponsor's mental model stays consistent. The
      `overdue` segment is a derived view (no persisted status on the
      row) \u2014 we filter client-side after fetching the union of `sent`
      rows + paid rows + drafts.
    - `{ server: false }` on asyncData. Invoice mock state lives in the
      same client-side module the WO/quote pipeline mutates, so we
      never SSR-fetch this list.
    - Each row links to the future detail page at
      `/admin/invoices/[id]` (E8-S2).

  # Decision cast down
    - Rejected: per-property scoping in the URL. The org-wide list is
      the primary surface; per-property invoice tabs land in E8-S2 via
      a property tab CTA.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { formatCents } from '~~/shared/utils/money'
import {
  deriveInvoiceView,
  INVOICE_VIEW_LABEL,
  type Invoice,
  type InvoiceView,
} from '~~/shared/contracts/invoice'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Invoices' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const invoice = useService('invoice')
const property = useService('property')

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

type Filter = 'all' | InvoiceView

const STATUS_FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
]

const STATUS_TONE: Record<InvoiceView, string> = {
  draft: 'bg-surface-muted text-text-secondary',
  sent: 'bg-status-info/10 text-status-info',
  overdue: 'bg-status-error/10 text-status-error',
  paid: 'bg-status-success/10 text-status-success',
}

const activeFilter = computed<Filter>(() => {
  const q = String(route.query.status ?? 'all')
  return STATUS_FILTERS.some((f) => f.value === q) ? (q as Filter) : 'all'
})

function setFilter(v: string) {
  router.push({ query: { ...route.query, status: v === 'all' ? undefined : v } })
}

const { data: bundle } = await useAsyncData(
  () => `invoices-list-${orgId.value}`,
  async () => {
    const list = await invoice.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 200,
    })
    const propertyIds = Array.from(new Set(list.rows.map((i) => i.propertyId)))
    const propMap = new Map<string, string>()
    await Promise.all(
      propertyIds.map(async (pid) => {
        const p = await property.get(pid, orgId.value)
        if (p) propMap.set(pid, `${p.addressLine1}, ${p.city}, ${p.state}`)
      }),
    )
    return { rows: list.rows, total: list.total, propMap }
  },
  { server: false, watch: [orgId] },
)

const NOW_ISO = new Date().toISOString()

function viewFor(inv: Invoice): InvoiceView {
  return deriveInvoiceView(inv, NOW_ISO)
}

const filteredRows = computed<Invoice[]>(() => {
  const all = bundle.value?.rows ?? []
  if (activeFilter.value === 'all') return all
  return all.filter((inv) => viewFor(inv) === activeFilter.value)
})

function addressFor(inv: Invoice): string {
  return bundle.value?.propMap.get(inv.propertyId) ?? ''
}

function detailLinkFor(inv: Invoice): string {
  return `/admin/invoices/${inv.id}`
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="invoices-list">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-display">Invoices</h1>
        <p class="text-body text-text-secondary mt-1">
          {{ filteredRows.length }}
          {{ filteredRows.length === 1 ? 'invoice' : 'invoices' }}
          <span v-if="activeFilter !== 'all'"
            > · {{ INVOICE_VIEW_LABEL[activeFilter as InvoiceView] }}</span
          >
        </p>
      </div>
      <NuxtLink
        to="/admin/invoices/new"
        data-testid="new-invoice-button"
        class="inline-flex items-center justify-center rounded-input bg-primary text-white text-body font-medium px-4 h-input hover:bg-primary-hover transition-colors"
      >
        + New invoice
      </NuxtLink>
    </header>

    <div class="mt-4">
      <BulwarkSegmentedControl
        :model-value="activeFilter"
        :options="STATUS_FILTERS"
        aria-label="Filter invoices by status"
        data-testid="invoice-status-filter"
        @update:model-value="setFilter"
      />
    </div>

    <div v-if="filteredRows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No invoices match this filter"
        body="Try a different filter or create an invoice from a completed work order."
        :cta="{ label: 'New invoice', to: '/admin/invoices/new' }"
        data-testid="invoices-empty"
      />
    </div>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li v-for="inv in filteredRows" :key="inv.id" data-testid="invoice-row">
        <NuxtLink :to="detailLinkFor(inv)" class="block">
          <BulwarkCard padding="md" clickable>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p
                  class="text-body font-medium text-text-primary"
                  data-testid="invoice-row-number"
                >
                  {{ inv.invoiceNumber }}
                </p>
                <p
                  v-if="addressFor(inv)"
                  class="text-small text-text-secondary truncate"
                  data-testid="invoice-row-address"
                >
                  {{ addressFor(inv) }}
                </p>
              </div>
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                    STATUS_TONE[viewFor(inv)],
                  ]"
                  data-testid="invoice-row-status"
                  :data-status="viewFor(inv)"
                >
                  {{ INVOICE_VIEW_LABEL[viewFor(inv)] }}
                </span>
                <span
                  class="text-body font-medium"
                  data-testid="invoice-row-total"
                >
                  {{ formatCents(inv.totals.totalCents) }}
                </span>
              </div>
            </div>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

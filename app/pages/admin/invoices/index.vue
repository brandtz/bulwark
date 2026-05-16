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
const { t: tLabel } = useLabel()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

type Filter = 'all' | InvoiceView

const STATUS_FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: tLabel('status.invoice', 'draft', INVOICE_VIEW_LABEL.draft) },
  { value: 'sent', label: tLabel('status.invoice', 'sent', INVOICE_VIEW_LABEL.sent) },
  { value: 'partial', label: tLabel('status.invoice', 'partial', INVOICE_VIEW_LABEL.partial) },
  { value: 'overdue', label: tLabel('status.invoice', 'overdue', INVOICE_VIEW_LABEL.overdue) },
  { value: 'paid', label: tLabel('status.invoice', 'paid', INVOICE_VIEW_LABEL.paid) },
  { value: 'voided', label: tLabel('status.invoice', 'voided', INVOICE_VIEW_LABEL.voided) },
]

const STATUS_TONE: Record<InvoiceView, string> = {
  draft: 'bg-surface-muted text-text-secondary',
  sent: 'bg-status-info/10 text-status-info',
  partial: 'bg-status-warning/10 text-status-warning',
  overdue: 'bg-status-error/10 text-status-error',
  paid: 'bg-status-success/10 text-status-success',
  voided: 'bg-surface-muted text-text-tertiary line-through',
}

const activeFilter = computed<Filter>(() => {
  const q = String(route.query.status ?? 'all')
  return STATUS_FILTERS.some((f) => f.value === q) ? (q as Filter) : 'all'
})

function setFilter(v: string) {
  router.push({ query: { ...route.query, status: v === 'all' ? undefined : v } })
}

// W4-1 / EH-P — saved-views integration.
const currentFilters = computed(() => ({ status: activeFilter.value }))
function applySavedView(payload: { filters: Record<string, unknown> }) {
  const next = typeof payload.filters?.status === 'string' ? payload.filters.status : 'all'
  setFilter(next)
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

const NOW_MS = Date.parse(NOW_ISO)
/**
 * Days past due for sent/partial rows. Returns null when not applicable
 * (no due date, draft/paid/voided, or not yet overdue).
 */
function daysPastDue(inv: Invoice): number | null {
  const view = viewFor(inv)
  if (view !== 'sent' && view !== 'partial' && view !== 'overdue') return null
  const due = inv.dueDate ?? inv.dueAt
  if (!due) return null
  const dueMs = Date.parse(due)
  if (!Number.isFinite(dueMs) || dueMs >= NOW_MS) return null
  return Math.ceil((NOW_MS - dueMs) / 86_400_000)
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

    <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
      <BulwarkSegmentedControl
        :model-value="activeFilter"
        :options="STATUS_FILTERS"
        aria-label="Filter invoices by status"
        data-testid="invoice-status-filter"
        @update:model-value="setFilter"
      />
      <SavedViewsMenu
        entity-type="invoice"
        :current-filters="currentFilters"
        @apply="applySavedView"
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
                  v-if="daysPastDue(inv) !== null"
                  class="inline-flex items-center rounded-pill px-2 py-0.5 text-tiny font-medium bg-status-error/10 text-status-error whitespace-nowrap"
                  data-testid="invoice-row-days-past-due"
                >
                  {{ daysPastDue(inv) }}d past due
                </span>
                <span
                  :class="[
                    'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                    STATUS_TONE[viewFor(inv)],
                  ]"
                  data-testid="invoice-row-status"
                  :data-status="viewFor(inv)"
                >
                  {{ tLabel('status.invoice', viewFor(inv), INVOICE_VIEW_LABEL[viewFor(inv)]) }}
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

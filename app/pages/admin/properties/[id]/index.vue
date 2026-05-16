<!--
  app/pages/admin/properties/[id].vue — property detail hub (E3-S5).

  # Decisions (ADR-0008)
    - Hub-and-tabs pattern: every domain that hangs off a property
      (assessments, quotes, work orders, compliance, invoices) gets its own
      tab so the operator stays on one URL when triaging a job. The tab
      list IS the screen contract for E4..E10 — those epics will replace
      the placeholder bodies with real surfaces.
    - The `?tab=` query param is the source of truth so a deep link from
      the pipeline kanban can preselect e.g. `?tab=quotes`.
    - Overview tab is populated NOW (data is already in the property /
      client mocks). All other tabs render `<EmptyState>` placeholders
      that point to their owning epic via the title/body — the components
      and routes will be added in their epics, not here.
    - 404 surface: when `property` is null we render `<EmptyState>` with a
      back-to-pipeline CTA rather than throwing — the kanban could
      legitimately deep-link to a deleted/cancelled property and the user
      should land somewhere useful.

  # Decision cast down
    - Rejected: nested routes (`/admin/properties/[id]/assessment` etc).
      We considered it but the friction of mounting the same shell + breadcrumb
      five times wasn't worth the URL elegance. A `?tab=` query is enough
      for screen-readers (each tabpanel has its own aria-selected) and lets
      the back button act on the form state, not the navigation history.
    - Rejected: separate "view-only" vs "edit" pages. Each tab will own
      its own inline edit affordances when the corresponding epic lands.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { safeUrl } from '~/utils/safeUrl'
import { evaluateCompliance, OREGON_DEFAULT_STANDARDS } from '~~/shared/utils/compliance'
import { formatCents } from '~~/shared/utils/money'
import type { Quote } from '~~/shared/contracts/quote'
import type { WorkOrder } from '~~/shared/contracts/work-order'
import type { Invoice } from '~~/shared/contracts/invoice'
import type { ComplianceDoc } from '~~/shared/contracts/compliance'
import type { AuditLogRow } from '~~/shared/contracts/audit'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()
const router = useRouter()

const propertyId = computed(() => String(route.params.id))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const property = useService('property')
const client = useService('client')
const assessment = useService('assessment')
const quoteSvc = useService('quote')
const workOrderSvc = useService('workOrder')
const invoiceSvc = useService('invoice')
const complianceSvc = useService('complianceDoc')
const auditSvc = useService('audit')
// W2-1 / EH-E (ADR-0018): property depth — buildings, contacts, photos.
const propertyDepthSvc = property
const { data: detail } = await useAsyncData(
  () => `property-detail-${propertyId.value}-${orgId.value}`,
  async () => {
    const p = await property.get(propertyId.value, orgId.value)
    if (!p) {
      return {
        property: null,
        client: null,
        assessment: null,
        quotes: [] as Quote[],
        workOrders: [] as WorkOrder[],
        invoices: [] as Invoice[],
        complianceDocs: [] as ComplianceDoc[],
        timeline: [] as AuditLogRow[],
      }
    }
    // EH-D / W1-4: parallel rollup fetch. Each child list is scoped
    // by propertyId so we avoid the full-tenant scan.
    const [c, a, quotes, workOrders, invoices, complianceDocs, timeline] =
      await Promise.all([
        p.clientId ? client.get(p.clientId, orgId.value) : Promise.resolve(null),
        assessment.getLatestForProperty(p.id, orgId.value),
        quoteSvc
          .list({ organizationId: orgId.value, propertyId: p.id, page: 1, pageSize: 50 })
          .then((r) => r.rows)
          .catch(() => []),
        workOrderSvc
          .list({ organizationId: orgId.value, propertyId: p.id, page: 1, pageSize: 50 })
          .then((r) => r.rows)
          .catch(() => []),
        invoiceSvc
          .list({ organizationId: orgId.value, propertyId: p.id, page: 1, pageSize: 50 })
          .then((r) => r.rows)
          .catch(() => []),
        complianceSvc
          .list({ organizationId: orgId.value, propertyId: p.id })
          .catch(() => [] as ComplianceDoc[]),
        auditSvc
          .timelineForProperty({
            organizationId: orgId.value,
            propertyId: p.id,
            limit: 200,
          })
          .catch(() => [] as AuditLogRow[]),
      ])
    return {
      property: p,
      client: c,
      assessment: a,
      quotes,
      workOrders,
      invoices,
      complianceDocs,
      timeline,
    }
  },
  { watch: [propertyId, orgId] },
)

useHead(() => ({
  title: detail.value?.property
    ? `${detail.value.property.addressLine1} — Bulwark`
    : 'Property — Bulwark',
}))

// W2-1 / EH-E (ADR-0018): property depth — buildings, contacts, primary
// photo. Separate fetch from the rollup so a depth-fetch failure does
// NOT poison the existing rollup card (and vice versa).
const { data: depth } = await useAsyncData(
  () => `property-depth-${propertyId.value}-${orgId.value}`,
  () =>
    propertyDepthSvc
      .getWithDepth(propertyId.value, orgId.value)
      .catch(() => null),
  { default: () => null, watch: [propertyId, orgId] },
)

// --- Tab plumbing ----------------------------------------------------------

type TabKey =
  | 'overview'
  | 'assessment'
  | 'quotes'
  | 'work-orders'
  | 'compliance'
  | 'invoices'
  | 'activity'
  | 'photos'
  | 'notes'

// EH-D / W1-4: tab counts derive from the rollup fetch so the
// operator can see at a glance which surfaces have content without
// clicking into each one. Empty tabs hide the badge (no zero noise).
const ACTIVE_QUOTE_STATUSES = new Set([
  'draft', 'sent', 'accepted',
])

const activeQuotes = computed(() =>
  (detail.value?.quotes ?? []).filter((q) =>
    ACTIVE_QUOTE_STATUSES.has(q.status),
  ),
)

const activeWorkOrders = computed(() =>
  (detail.value?.workOrders ?? []).filter((w) => w.status !== 'cancelled'),
)

const openInvoices = computed(() =>
  (detail.value?.invoices ?? []).filter((i) => i.status !== 'paid'),
)

const latestComplianceDoc = computed<ComplianceDoc | null>(() => {
  const list = detail.value?.complianceDocs ?? []
  if (list.length === 0) return null
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
})

const TABS = computed<{ value: TabKey; label: string; count?: number }[]>(() => [
  { value: 'overview',    label: 'Overview' },
  { value: 'assessment',  label: 'Assessment' },
  { value: 'quotes',      label: 'Quotes',      count: activeQuotes.value.length },
  { value: 'work-orders', label: 'Work orders', count: activeWorkOrders.value.length },
  { value: 'compliance',  label: 'Compliance',  count: (detail.value?.complianceDocs ?? []).length },
  { value: 'invoices',    label: 'Invoices',    count: openInvoices.value.length },
  { value: 'activity',    label: 'Activity',    count: (detail.value?.timeline ?? []).length },
  { value: 'photos',      label: 'Photos' },
  { value: 'notes',       label: 'Notes' },
])

const VALID_TAB_VALUES = TABS.value.map((t) => t.value) as readonly TabKey[]

function readTabFromQuery(): TabKey {
  const q = route.query.tab
  const v = Array.isArray(q) ? q[0] : q
  return (VALID_TAB_VALUES as readonly string[]).includes(String(v))
    ? (v as TabKey)
    : 'overview'
}

const activeTab = ref<TabKey>(readTabFromQuery())

watch(activeTab, (next) => {
  router.replace({ query: { ...route.query, tab: next } })
})

watch(() => route.query.tab, () => {
  activeTab.value = readTabFromQuery()
})

const fullAddress = computed(() => {
  const p = detail.value?.property
  if (!p) return ''
  const line2 = p.addressLine2 ? `, ${p.addressLine2}` : ''
  return `${p.addressLine1}${line2}, ${p.city}, ${p.state} ${p.postalCode}`
})

// Assessment-tab data (E4-S4): if there's a latest assessment, run it
// through the pure evaluator client-side. We use the Oregon defaults
// here; per-tenant override (E9) will swap to a settings-service call.
const compliance = computed(() => {
  const a = detail.value?.assessment
  if (!a) return null
  return evaluateCompliance(a, OREGON_DEFAULT_STANDARDS)
})
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="property-detail">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: detail?.property?.addressLine1 ?? 'Not found' },
      ]"
    />

    <!-- 404-style surface for missing/cross-tenant properties. -->
    <template v-if="!detail?.property">
      <EmptyState
        icon="·"
        title="Property not found"
        body="It may have been deleted, or you don't have access."
        :cta="{ label: 'Back to pipeline', to: '/admin/properties' }"
        data-testid="property-not-found"
      />
    </template>

    <template v-else>
      <header class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-display truncate" data-testid="property-address">
            {{ detail.property.addressLine1 }}
          </h1>
          <p class="text-body text-text-secondary mt-1">
            {{ fullAddress }}
          </p>
        </div>
        <StatusBadge :status="detail.property.status" />
      </header>

      <!-- W2-1 / EH-E (ADR-0018): depth sub-navigation. -->
      <PropertyPropertyDepthNav :property-id="propertyId" class="mt-4" />

      <BulwarkTabs
        v-model="activeTab"
        :tabs="TABS"
        aria-label="Property sections"
        class="mt-6"
        data-testid="property-tabs"
      >
        <template #tab-overview>
          <section class="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="tab-panel-overview">
            <BulwarkCard padding="md">
              <h2 class="text-h2 mb-2">Address</h2>
              <p class="text-body">{{ detail.property.addressLine1 }}</p>
              <p v-if="detail.property.addressLine2" class="text-body">
                {{ detail.property.addressLine2 }}
              </p>
              <p class="text-body">
                {{ detail.property.city }}, {{ detail.property.state }} {{ detail.property.postalCode }}
              </p>
            </BulwarkCard>

            <BulwarkCard padding="md">
              <h2 class="text-h2 mb-2">Client</h2>
              <template v-if="detail.client">
                <p class="text-body" data-testid="overview-client-name">
                  {{ detail.client.fullName }}
                </p>
                <p class="text-small text-text-secondary mt-1">
                  {{ detail.client.email ?? '—' }} · {{ detail.client.phone }}
                </p>
                <NuxtLink
                  :to="`/admin/clients/${detail.client.id}`"
                  class="text-small text-primary mt-2 inline-block"
                >
                  View client profile →
                </NuxtLink>
              </template>
              <template v-else>
                <p class="text-body text-text-secondary">No client linked yet.</p>
              </template>
            </BulwarkCard>

            <BulwarkCard v-if="detail.property.notes" padding="md" class="md:col-span-2">
              <h2 class="text-h2 mb-2">Notes</h2>
              <p class="text-body whitespace-pre-line">{{ detail.property.notes }}</p>
            </BulwarkCard>

            <!-- W2-1 / EH-E (ADR-0018): property details card with the
                 deeper metadata. Only renders if at least one field is
                 set to avoid an empty card on legacy properties. -->
            <BulwarkCard
              v-if="detail.property.lotSizeAcres != null
                || detail.property.parcelNumber
                || detail.property.yearBuilt != null
                || detail.property.accessNotes
                || detail.property.gateCode
                || detail.property.specialInstructions"
              padding="md"
              class="md:col-span-2"
              data-testid="overview-property-details"
            >
              <h2 class="text-h2 mb-2">Property details</h2>
              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-body">
                <div v-if="detail.property.lotSizeAcres != null">
                  <dt class="text-small text-text-secondary">Lot size</dt>
                  <dd>{{ detail.property.lotSizeAcres }} ac</dd>
                </div>
                <div v-if="detail.property.parcelNumber">
                  <dt class="text-small text-text-secondary">Parcel #</dt>
                  <dd>{{ detail.property.parcelNumber }}</dd>
                </div>
                <div v-if="detail.property.yearBuilt != null">
                  <dt class="text-small text-text-secondary">Year built</dt>
                  <dd>{{ detail.property.yearBuilt }}</dd>
                </div>
                <div v-if="detail.property.gateCode">
                  <dt class="text-small text-text-secondary">Gate code</dt>
                  <dd class="font-mono">{{ detail.property.gateCode }}</dd>
                </div>
                <div v-if="detail.property.accessNotes" class="sm:col-span-2">
                  <dt class="text-small text-text-secondary">Access notes</dt>
                  <dd class="whitespace-pre-line">{{ detail.property.accessNotes }}</dd>
                </div>
                <div v-if="detail.property.specialInstructions" class="sm:col-span-2">
                  <dt class="text-small text-text-secondary">Special instructions</dt>
                  <dd class="whitespace-pre-line">{{ detail.property.specialInstructions }}</dd>
                </div>
              </dl>
            </BulwarkCard>

            <!-- W2-1 / EH-E: primary on-site contact (depth fetch). -->
            <BulwarkCard
              v-if="depth?.contacts.find((c) => c.isPrimary)"
              padding="md"
              data-testid="overview-primary-contact"
            >
              <h2 class="text-h2 mb-2">Primary contact</h2>
              <template v-for="c in depth?.contacts ?? []" :key="c.id">
                <template v-if="c.isPrimary">
                  <p class="text-body font-medium">{{ c.firstName }} {{ c.lastName }}</p>
                  <p class="text-small text-text-secondary mt-1">
                    {{ c.email ?? '—' }} · {{ c.phone ?? '—' }}
                  </p>
                  <NuxtLink
                    :to="`/admin/properties/${propertyId}/contacts`"
                    class="text-small text-primary mt-2 inline-block"
                  >Manage contacts →</NuxtLink>
                </template>
              </template>
            </BulwarkCard>

            <!-- W2-1 / EH-E: primary photo preview (first photo only). -->
            <BulwarkCard
              v-if="depth?.primaryPhotoUrl"
              padding="none"
              data-testid="overview-primary-photo"
            >
              <NuxtLink :to="`/admin/properties/${propertyId}/photos`">
                <img
                  :src="safeUrl(depth.primaryPhotoUrl) ?? '/icons/sprite.svg#bw-image'"
                  alt="Property photo"
                  class="w-full aspect-video object-cover rounded-card"
                  loading="lazy"
                >
              </NuxtLink>
            </BulwarkCard>

            <!-- W2-1 / EH-E: building tiles. Clicking opens the building
                 detail. We always render this card when any building
                 exists so the operator can see structure at a glance. -->
            <BulwarkCard
              v-if="depth && depth.buildings.length > 0"
              padding="md"
              class="md:col-span-2"
              data-testid="overview-buildings"
            >
              <header class="flex items-center justify-between mb-3">
                <h2 class="text-h2">Buildings</h2>
                <NuxtLink
                  :to="`/admin/properties/${propertyId}/buildings`"
                  class="text-small text-primary hover:underline"
                >
                  View all →
                </NuxtLink>
              </header>
              <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="overview-buildings-tiles">
                <li v-for="b in depth.buildings" :key="b.id">
                  <NuxtLink
                    :to="`/admin/properties/${propertyId}/buildings/${b.id}`"
                    class="block p-3 border border-border-default rounded-card hover:border-primary transition"
                    data-testid="overview-building-tile"
                    :data-building-id="b.id"
                  >
                    <p class="text-body font-medium truncate">{{ b.name }}</p>
                    <p class="text-small text-text-secondary mt-0.5">
                      {{ b.sections.length }} section(s)
                      <span v-if="b.squareFeet"> · {{ b.squareFeet }} sq ft</span>
                    </p>
                  </NuxtLink>
                </li>
              </ul>
            </BulwarkCard>

            <!-- EH-D / W1-4: Linked work rollup. Always present once a
                 property has any children so the operator can see the
                 active spine of the job (active quotes, open WOs,
                 open invoices, current compliance doc) without
                 hunting through tabs. -->
            <BulwarkCard
              v-if="activeQuotes.length || activeWorkOrders.length || openInvoices.length || latestComplianceDoc"
              padding="md"
              class="md:col-span-2"
              data-testid="property-linked-work"
            >
              <h2 class="text-h2 mb-3">Linked work</h2>
              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-if="activeQuotes.length" data-testid="rollup-active-quotes">
                  <dt class="text-small text-text-secondary">Active quotes</dt>
                  <dd class="mt-1 flex flex-wrap gap-2">
                    <NuxtLink
                      v-for="q in activeQuotes"
                      :key="q.id"
                      :to="`/admin/properties/${propertyId}/quotes/${q.id}`"
                      class="inline-flex items-center gap-2 rounded-pill bg-surface-muted px-2.5 py-1 text-small text-primary hover:underline"
                    >
                      {{ q.quoteNumber }}
                      <span class="text-text-secondary">{{ q.status }}</span>
                    </NuxtLink>
                  </dd>
                </div>
                <div v-if="activeWorkOrders.length" data-testid="rollup-active-work-orders">
                  <dt class="text-small text-text-secondary">Active work orders</dt>
                  <dd class="mt-1 flex flex-wrap gap-2">
                    <NuxtLink
                      v-for="w in activeWorkOrders"
                      :key="w.id"
                      :to="`/admin/work-orders/${w.id}`"
                      class="inline-flex items-center gap-2 rounded-pill bg-surface-muted px-2.5 py-1 text-small text-primary hover:underline"
                    >
                      {{ w.workOrderNumber }}
                      <span class="text-text-secondary">{{ w.status }}</span>
                    </NuxtLink>
                  </dd>
                </div>
                <div v-if="openInvoices.length" data-testid="rollup-open-invoices">
                  <dt class="text-small text-text-secondary">Open invoices</dt>
                  <dd class="mt-1 flex flex-wrap gap-2">
                    <NuxtLink
                      v-for="inv in openInvoices"
                      :key="inv.id"
                      :to="`/admin/invoices/${inv.id}`"
                      class="inline-flex items-center gap-2 rounded-pill bg-surface-muted px-2.5 py-1 text-small text-primary hover:underline"
                    >
                      {{ inv.invoiceNumber }}
                      <span class="text-text-secondary">{{ inv.status }}</span>
                    </NuxtLink>
                  </dd>
                </div>
                <div v-if="latestComplianceDoc" data-testid="rollup-compliance-doc">
                  <dt class="text-small text-text-secondary">Latest compliance doc</dt>
                  <dd class="mt-1">
                    <NuxtLink
                      :to="`/admin/properties/${propertyId}/compliance/${latestComplianceDoc.id}`"
                      class="inline-flex items-center gap-2 rounded-pill bg-surface-muted px-2.5 py-1 text-small text-primary hover:underline"
                    >
                      {{ latestComplianceDoc.createdAt.slice(0, 10) }}
                      <span class="text-text-secondary">{{ latestComplianceDoc.status }}</span>
                    </NuxtLink>
                  </dd>
                </div>
              </dl>
            </BulwarkCard>
          </section>
        </template>

        <template #tab-assessment>
          <section data-testid="tab-panel-assessment">
            <!-- No assessment yet — direct CTA into the form. -->
            <div v-if="!compliance" class="flex flex-col items-start gap-4">
              <EmptyState
                icon="·"
                title="No assessment yet"
                body="Capture roof, siding, eaves, vents, and defensible-space data to evaluate Oregon WUI compliance."
                class="self-stretch"
              />
              <NuxtLink
                :to="`/admin/properties/${propertyId}/assessment`"
                class="self-center inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
                data-testid="tab-start-assessment-cta"
              >
                Start assessment
              </NuxtLink>
            </div>

            <!-- Latest assessment exists — show compliance summary preview. -->
            <div v-else class="flex flex-col gap-4">
              <BulwarkCard
                padding="md"
                :class="compliance.overallCompliant ? 'border-status-success' : 'border-status-error'"
                data-testid="assessment-tab-banner"
                :data-compliant="compliance.overallCompliant ? 'true' : 'false'"
              >
                <div class="flex items-start gap-4">
                  <div
                    class="text-2xl"
                    :class="compliance.overallCompliant ? 'text-status-success' : 'text-status-error'"
                  >
                    {{ compliance.overallCompliant ? '✓' : '!' }}
                  </div>
                  <div class="flex-1">
                    <h2 class="text-h2">
                      {{ compliance.overallCompliant ? 'Compliant' : 'Non-compliant' }}
                    </h2>
                    <p class="text-body text-text-secondary mt-1">
                      <template v-if="compliance.overallCompliant">
                        All measured fields meet Oregon WUI baseline standards.
                      </template>
                      <template v-else>
                        {{ compliance.requiredUpgrades.length }} item(s) require upgrade.
                      </template>
                    </p>
                  </div>
                </div>
              </BulwarkCard>

              <div class="flex items-center gap-4">
                <NuxtLink
                  :to="`/admin/properties/${propertyId}/assessment-summary`"
                  class="text-body text-primary hover:underline"
                  data-testid="tab-view-summary-link"
                >
                  View full summary →
                </NuxtLink>
                <NuxtLink
                  :to="`/admin/properties/${propertyId}/assessment`"
                  class="text-body text-text-secondary hover:text-text-primary"
                  data-testid="tab-redo-assessment-link"
                >
                  Re-run assessment
                </NuxtLink>
              </div>
            </div>
          </section>
        </template>

        <template #tab-quotes>
          <section data-testid="tab-panel-quotes" class="flex flex-col gap-4">
            <!-- EH-D / W1-4 rollup: show every quote for this property so
                 the operator can jump straight to the source of a status
                 transition without leaving the page. -->
            <BulwarkCard v-if="detail.quotes.length > 0" padding="none">
              <ul class="divide-y divide-border-default" data-testid="property-quotes-list">
                <li
                  v-for="q in detail.quotes"
                  :key="q.id"
                  class="p-3 md:p-4 flex items-center justify-between gap-3"
                  data-testid="property-quote-row"
                  :data-quote-id="q.id"
                >
                  <div class="min-w-0">
                    <NuxtLink
                      :to="`/admin/properties/${propertyId}/quotes/${q.id}`"
                      class="text-body font-medium text-primary hover:underline"
                    >
                      {{ q.quoteNumber }}
                    </NuxtLink>
                    <p class="text-small text-text-secondary mt-0.5">
                      {{ formatCents(q.totals.totalCents) }}
                    </p>
                  </div>
                  <span class="inline-flex items-center rounded-pill px-2 py-0.5 text-small bg-surface-muted text-text-secondary">{{ q.status }}</span>
                </li>
              </ul>
            </BulwarkCard>
            <EmptyState
              v-else
              icon="·"
              title="No quotes yet"
              body="Build the first quote for this property."
              class="self-stretch"
            />
            <NuxtLink
              :to="`/admin/properties/${propertyId}/quotes/new`"
              class="self-start inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
              data-testid="tab-new-quote-cta"
            >
              New quote
            </NuxtLink>
          </section>
        </template>

        <template #tab-work-orders>
          <section data-testid="tab-panel-work-orders" class="flex flex-col gap-4">
            <BulwarkCard v-if="detail.workOrders.length > 0" padding="none">
              <ul class="divide-y divide-border-default" data-testid="property-work-orders-list">
                <li
                  v-for="w in detail.workOrders"
                  :key="w.id"
                  class="p-3 md:p-4 flex items-center justify-between gap-3"
                  data-testid="property-work-order-row"
                  :data-work-order-id="w.id"
                >
                  <div class="min-w-0">
                    <NuxtLink
                      :to="`/admin/work-orders/${w.id}`"
                      class="text-body font-medium text-primary hover:underline"
                    >
                      {{ w.workOrderNumber }}
                    </NuxtLink>
                    <p class="text-small text-text-secondary mt-0.5">
                      {{ w.tradeSlots.length }} trade slot(s)
                    </p>
                  </div>
                  <span class="inline-flex items-center rounded-pill px-2 py-0.5 text-small bg-surface-muted text-text-secondary">{{ w.status }}</span>
                </li>
              </ul>
            </BulwarkCard>
            <EmptyState
              v-else
              icon="·"
              title="No work orders yet"
              body="Convert an accepted quote into a work order to begin scheduling."
            />
          </section>
        </template>

        <template #tab-compliance>
          <section data-testid="tab-panel-compliance" class="flex flex-col gap-4">
            <BulwarkCard v-if="detail.complianceDocs.length > 0" padding="none">
              <ul class="divide-y divide-border-default" data-testid="property-compliance-list">
                <li
                  v-for="doc in detail.complianceDocs"
                  :key="doc.id"
                  class="p-3 md:p-4 flex items-center justify-between gap-3"
                  data-testid="property-compliance-row"
                  :data-doc-id="doc.id"
                >
                  <div class="min-w-0">
                    <NuxtLink
                      :to="`/admin/properties/${propertyId}/compliance/${doc.id}`"
                      class="text-body font-medium text-primary hover:underline"
                    >
                      Compliance doc · {{ doc.createdAt.slice(0, 10) }}
                    </NuxtLink>
                    <p class="text-small text-text-secondary mt-0.5">
                      Covers {{ doc.workOrderIds.length }} work order(s)
                    </p>
                  </div>
                  <span
                    class="inline-flex items-center rounded-pill px-2 py-0.5 text-small bg-surface-muted text-text-secondary"
                  >{{ doc.status }}</span>
                </li>
              </ul>
            </BulwarkCard>
            <EmptyState
              v-else
              icon="·"
              title="No compliance docs yet"
              body="Generate the homeowner-and-insurer-facing PDF from completed work-order trade slots."
              class="self-stretch"
            />
            <NuxtLink
              :to="`/admin/properties/${propertyId}/compliance/new`"
              class="self-start inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
              data-testid="tab-start-compliance-cta"
            >
              Generate compliance doc
            </NuxtLink>
          </section>
        </template>

        <template #tab-invoices>
          <section data-testid="tab-panel-invoices" class="flex flex-col gap-4">
            <BulwarkCard v-if="detail.invoices.length > 0" padding="none">
              <ul class="divide-y divide-border-default" data-testid="property-invoices-list">
                <li
                  v-for="inv in detail.invoices"
                  :key="inv.id"
                  class="p-3 md:p-4 flex items-center justify-between gap-3"
                  data-testid="property-invoice-row"
                  :data-invoice-id="inv.id"
                >
                  <div class="min-w-0">
                    <NuxtLink
                      :to="`/admin/invoices/${inv.id}`"
                      class="text-body font-medium text-primary hover:underline"
                    >
                      {{ inv.invoiceNumber }}
                    </NuxtLink>
                    <p class="text-small text-text-secondary mt-0.5">
                      {{ formatCents(inv.totals.totalCents) }}
                    </p>
                  </div>
                  <span class="inline-flex items-center rounded-pill px-2 py-0.5 text-small bg-surface-muted text-text-secondary">{{ inv.status }}</span>
                </li>
              </ul>
            </BulwarkCard>
            <EmptyState
              v-else
              icon="·"
              title="No invoices yet"
              body="Create an invoice from a completed work order."
            />
          </section>
        </template>

        <template #tab-activity>
          <!-- EH-D / W1-4: vertical activity timeline. Reads
               audit_log filtered by entityId = propertyId OR linked
               child entity ids (quotes, WOs, invoices, assessments,
               compliance). Reverse-chrono. -->
          <section data-testid="tab-panel-activity">
            <EmptyState
              v-if="detail.timeline.length === 0"
              icon="·"
              title="No activity yet"
              body="Status changes and other events on this property will appear here."
            />
            <ol v-else class="relative border-l border-border-default ml-3 space-y-4" data-testid="property-activity-timeline">
              <li
                v-for="row in detail.timeline"
                :key="row.id"
                class="pl-4 relative"
                data-testid="property-activity-row"
                :data-entity-type="row.entityType"
                :data-entity-id="row.entityId"
                :data-action="row.action"
              >
                <span
                  class="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <p class="text-small text-text-secondary">
                  {{ new Date(row.createdAt).toLocaleString() }}
                </p>
                <p class="text-body">
                  <span class="font-medium">{{ row.entityType }}</span>
                  · {{ (row.metadata as Record<string, unknown>)?.kind ?? row.action }}
                </p>
                <p v-if="row.actorUserId" class="text-small text-text-secondary">
                  by {{ row.actorUserId.slice(0, 8) }}
                </p>
              </li>
            </ol>
          </section>
        </template>

        <template #tab-photos>
          <EmptyState
            icon="·"
            title="Photos land in Epic E4"
            body="The assessment camera + per-property gallery ship as part of the field-assessment epic. This tab is intentionally empty until then."
            data-testid="tab-panel-photos"
          />
        </template>

        <template #tab-notes>
          <EmptyState
            icon="·"
            title="Internal notes land in Epic E10"
            body="The activity feed and private (admin-only) notes are part of the messaging + history epic. This tab is intentionally empty until then."
            data-testid="tab-panel-notes"
          />
        </template>
      </BulwarkTabs>
    </template>
  </div>
</template>

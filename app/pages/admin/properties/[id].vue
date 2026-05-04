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

const { data: detail } = await useAsyncData(
  () => `property-detail-${propertyId.value}-${orgId.value}`,
  async () => {
    const p = await property.get(propertyId.value, orgId.value)
    if (!p) return { property: null, client: null }
    const c = p.clientId ? await client.get(p.clientId, orgId.value) : null
    return { property: p, client: c }
  },
  { watch: [propertyId, orgId] },
)

useHead(() => ({
  title: detail.value?.property
    ? `${detail.value.property.addressLine1} — Bulwark`
    : 'Property — Bulwark',
}))

// --- Tab plumbing ----------------------------------------------------------

type TabKey =
  | 'overview'
  | 'assessment'
  | 'quotes'
  | 'work-orders'
  | 'compliance'
  | 'invoices'
  | 'photos'
  | 'notes'

const TABS: { value: TabKey; label: string }[] = [
  { value: 'overview',    label: 'Overview' },
  { value: 'assessment',  label: 'Assessment' },
  { value: 'quotes',      label: 'Quotes' },
  { value: 'work-orders', label: 'Work orders' },
  { value: 'compliance',  label: 'Compliance' },
  { value: 'invoices',    label: 'Invoices' },
  { value: 'photos',      label: 'Photos' },
  { value: 'notes',       label: 'Notes' },
]

const VALID_TAB_VALUES = TABS.map((t) => t.value) as readonly TabKey[]

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
          </section>
        </template>

        <template #tab-assessment>
          <EmptyState
            icon="·"
            title="No assessment yet"
            body="Field assessment surfaces will land in Epic E4."
            data-testid="tab-panel-assessment"
          />
        </template>

        <template #tab-quotes>
          <EmptyState
            icon="·"
            title="No quotes yet"
            body="Quote builder + acceptance flow lands in Epic E5."
            data-testid="tab-panel-quotes"
          />
        </template>

        <template #tab-work-orders>
          <EmptyState
            icon="·"
            title="No work orders yet"
            body="Work-order assignment + scheduling lands in Epic E6."
            data-testid="tab-panel-work-orders"
          />
        </template>

        <template #tab-compliance>
          <EmptyState
            icon="·"
            title="No compliance docs yet"
            body="Compliance generator + standards config lands in Epic E8."
            data-testid="tab-panel-compliance"
          />
        </template>

        <template #tab-invoices>
          <EmptyState
            icon="·"
            title="No invoices yet"
            body="Invoice list + detail lands in Epic E9."
            data-testid="tab-panel-invoices"
          />
        </template>

        <template #tab-photos>
          <EmptyState
            icon="·"
            title="No photos yet"
            body="Photo capture + gallery lands in Epic E4 alongside assessment."
            data-testid="tab-panel-photos"
          />
        </template>

        <template #tab-notes>
          <EmptyState
            icon="·"
            title="No internal notes yet"
            body="Activity feed + private notes land in Epic E10."
            data-testid="tab-panel-notes"
          />
        </template>
      </BulwarkTabs>
    </template>
  </div>
</template>

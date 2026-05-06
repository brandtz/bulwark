<!--
  app/pages/admin/compliance/index.vue — org-wide compliance docs list.

  # Decisions (ADR-0008, post-audit gap fix 2026-05-06)
    - The sidebar has linked here since E1; until now the page didn't
      exist and the link 404'd. This patch ships the missing index.
    - Reuses `complianceDoc.list({ organizationId })` (propertyId is
      optional in the contract). One extra `property.list()` call to
      resolve addresses for display — same pattern as the quotes
      list (E5-S4) and invoices list (E8-S1).
    - Status filters mirror the contract enum minus `draft` (which is
      reserved for a future "save and finish later" flow and never
      appears today). `all` is the default.
    - Every row routes to the existing property-scoped detail page at
      `/admin/properties/[propertyId]/compliance/[docId]` so we don't
      fork the preview/polling/download UX.

  # Decision cast down
    - A "Generate new doc" button at the top of the list. Rejected —
      the generator needs a property + completed work orders for
      scope; there's no useful target without one. The empty state
      points users at /admin/properties.
    - Pagination. Rejected for v1 — doc volume per org is low; revisit
      when a real customer crosses ~100 docs.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { ComplianceDoc, ComplianceDocStatus } from '~~/shared/contracts/compliance'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Compliance' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const complianceDoc = useService('complianceDoc')
const property = useService('property')

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

type Filter = 'all' | ComplianceDocStatus
const STATUS_FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'generating', label: 'Generating' },
  { value: 'ready', label: 'Ready' },
  { value: 'failed', label: 'Failed' },
]

const STATUS_TONE: Record<ComplianceDocStatus, string> = {
  draft: 'bg-surface-muted text-text-secondary',
  generating: 'bg-status-info/10 text-status-info',
  ready: 'bg-status-success/10 text-status-success',
  failed: 'bg-status-error/10 text-status-error',
  cancelled: 'bg-surface-muted text-text-disabled',
}

const STATUS_LABEL: Record<ComplianceDocStatus, string> = {
  draft: 'Draft',
  generating: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const activeFilter = computed<Filter>(() => {
  const q = String(route.query.status ?? 'all')
  return STATUS_FILTERS.some((f) => f.value === q) ? (q as Filter) : 'all'
})

function setFilter(v: string) {
  router.push({ query: { ...route.query, status: v === 'all' ? undefined : v } })
}

const { data: bundle } = await useAsyncData(
  () => `compliance-list-${orgId.value}-${activeFilter.value}`,
  async () => {
    const all = await complianceDoc.list({ organizationId: orgId.value })
    const rows = activeFilter.value === 'all' ? all : all.filter((d) => d.status === activeFilter.value)
    const propertyIds = Array.from(new Set(rows.map((d) => d.propertyId)))
    const propMap = new Map<string, string>()
    await Promise.all(
      propertyIds.map(async (pid) => {
        const p = await property.get(pid, orgId.value)
        if (p) propMap.set(pid, `${p.addressLine1}, ${p.city}, ${p.state}`)
      }),
    )
    return { rows, total: rows.length, propMap }
  },
  { server: false, watch: [orgId, activeFilter] },
)

function addressFor(d: ComplianceDoc): string {
  return bundle.value?.propMap.get(d.propertyId) ?? ''
}

function detailLinkFor(d: ComplianceDoc): string {
  return `/admin/properties/${d.propertyId}/compliance/${d.id}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="compliance-list">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-display">Compliance</h1>
        <p class="text-body text-text-secondary mt-1">
          {{ bundle?.total ?? 0 }} {{ (bundle?.total ?? 0) === 1 ? 'document' : 'documents' }}
          <span v-if="activeFilter !== 'all'"> · {{ STATUS_LABEL[activeFilter as ComplianceDocStatus] }}</span>
        </p>
      </div>
    </header>

    <div class="mt-4">
      <BulwarkSegmentedControl
        :model-value="activeFilter"
        :options="STATUS_FILTERS"
        aria-label="Filter compliance docs by status"
        data-testid="compliance-status-filter"
        @update:model-value="setFilter"
      />
    </div>

    <div v-if="!bundle || bundle.rows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No compliance documents yet"
        body="Compliance packets are generated from a property's Compliance tab once work orders are complete."
        :cta="{ label: 'Browse properties', to: '/admin/properties' }"
        data-testid="compliance-empty"
      />
    </div>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li
        v-for="d in bundle.rows"
        :key="d.id"
        data-testid="compliance-row"
      >
        <NuxtLink :to="detailLinkFor(d)" class="block">
          <BulwarkCard padding="md" clickable>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-body font-medium text-text-primary" data-testid="compliance-row-signer">
                  {{ d.signature.signedByName }}
                </p>
                <p
                  v-if="addressFor(d)"
                  class="text-small text-text-secondary truncate"
                  data-testid="compliance-row-address"
                >
                  {{ addressFor(d) }}
                </p>
                <p class="text-tiny text-text-secondary mt-1">
                  Created {{ formatDate(d.createdAt) }}
                </p>
              </div>
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                    STATUS_TONE[d.status],
                  ]"
                  data-testid="compliance-row-status"
                  :data-status="d.status"
                >
                  {{ STATUS_LABEL[d.status] }}
                </span>
              </div>
            </div>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<!--
  app/pages/admin/properties.vue — Properties pipeline kanban (E3-S1, desktop).

  # Decisions (ADR-0008)
    - Server-rendered: we `await` the property list inside `setup` so the
      first paint already has cards. `useAsyncData` caches the result by
      key so a client-nav back to the page doesn't re-hit the mock.
    - Columns are derived client-side by grouping the full result by
      `status`. Mock fixtures cap at ~13 rows; for the real backend (E11)
      we'll switch to a per-status `list({ status })` parallel fetch when
      total rows exceed `pageSize`.
    - Page request asks for `pageSize: 100` so the demo dataset (one row
      per status, 13 total) always fits in a single payload. Sponsor demo
      stays deterministic; pagination + infinite columns land with E3-S3.
    - We render every status column even when empty — a missing column
      hides the entire end-of-pipeline (paid / cancelled), which would mask
      bugs in the status-update flow.
    - Mobile list view is E3-S2, drag-drop is E3-S3, search is later. This
      page offers a `kanban` ↔ `list` segmented toggle (FT-12). Default
      view is `kanban` server-side; on mount, narrow viewports flip to
      `list`. The chosen view is preserved across client navigations via
      `useState('properties.view')`.

  # Decision cast down
    - Rejected: a Pinia store for the property list. We removed `@pinia/nuxt`
      in E2-S6 (payload-plugin bug) and `useAsyncData` already caches across
      navigations. Re-add Pinia if/when a real cross-page mutation surface
      appears.
    - Rejected: hardcoding the column order from PROPERTY_STATUS enum
      iteration. The kanban order ("Lead → Scheduled → Assessed → …") is
      a UX decision, not a contract decision; pinning it here makes the
      visual flow legible.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { Property, PropertyStatus } from '~~/shared/contracts/property'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Properties' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const property = useService('property')

// Authoritative left-to-right kanban order for the demo. See ADR-0008
// note above for why this isn't sourced from the enum order.
const COLUMN_ORDER: PropertyStatus[] = [
  'lead',
  'scheduled',
  'assessed',
  'quoted',
  'accepted',
  'in_progress',
  'completed',
  'compliance_pending',
  'compliance_complete',
  'invoiced',
  'paid',
  'on_hold',
  'cancelled',
]

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: list } = await useAsyncData(
  () => `properties-${orgId.value}`,
  () =>
    property.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 100,
    }),
  {
    watch: [orgId],
    default: () => ({ rows: [], total: 0, page: 1, pageSize: 100 }),
  },
)

const groupedByStatus = computed<Record<PropertyStatus, Property[]>>(() => {
  const empty = Object.fromEntries(
    COLUMN_ORDER.map((s) => [s, [] as Property[]]),
  ) as Record<PropertyStatus, Property[]>
  for (const row of list.value?.rows ?? []) {
    empty[row.status].push(row)
  }
  return empty
})

// E3-S2: kanban ↔ list segmented toggle. State lives in useState so a
// nav back to the page preserves the user's choice. SSR default = kanban;
// onMounted we flip to list for narrow viewports so the first paint on a
// phone is the right shape after hydration.
type PipelineView = 'kanban' | 'list'
const view = useState<PipelineView>('properties.view', () => 'kanban')
const VIEW_OPTIONS = [
  { value: 'kanban', label: 'Kanban' },
  { value: 'list', label: 'List' },
]

onMounted(() => {
  if (typeof window !== 'undefined' && window.innerWidth < 768 && view.value === 'kanban') {
    view.value = 'list'
  }
})

// E3-S3: inline status change. We swap drag-drop for an explicit menu so
// the path is the same for keyboard, mouse, and touch — the field team
// re-stages without two-handed gestures and Playwright stays
// deterministic. Drag-drop sugar can be layered later without changing
// the data path because both surfaces emit `change-status`.
async function onChangeStatus(propertyId: string, status: PropertyStatus) {
  await property.updateStatus(propertyId, status, orgId.value)
  await refreshNuxtData(`properties-${orgId.value}`)
}
</script>

<template>
  <div class="flex flex-col h-full" data-testid="properties-pipeline">
    <header
      class="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-border bg-surface"
    >
      <div class="min-w-0">
        <h1 class="text-display">Properties</h1>
        <p class="text-caption text-text-secondary">
          {{ list?.total ?? 0 }} in pipeline
        </p>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <BulwarkSegmentedControl
          v-model="view"
          :options="VIEW_OPTIONS"
          aria-label="Pipeline view"
          data-testid="pipeline-view-toggle"
        />
        <NuxtLink
          to="/admin/properties/new"
          data-testid="new-property-button"
          class="inline-flex items-center justify-center rounded-input bg-primary text-white text-body font-medium px-4 h-input hover:bg-primary-hover transition-colors"
        >
          New property
        </NuxtLink>
      </div>
    </header>

    <div v-if="view === 'kanban'" class="flex-1 overflow-x-auto">
      <div class="flex gap-3 p-4 md:p-6 min-w-max">
        <PipelineColumn
          v-for="status in COLUMN_ORDER"
          :key="status"
          :status="status"
          :count="groupedByStatus[status].length"
        >
          <PropertyCard
            v-for="row in groupedByStatus[status]"
            :key="row.id"
            :property="row"
            @change-status="onChangeStatus"
          />
        </PipelineColumn>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto">
      <PipelineList
        :grouped-by-status="groupedByStatus"
        :column-order="COLUMN_ORDER"
        @change-status="onChangeStatus"
      />
    </div>
  </div>
</template>

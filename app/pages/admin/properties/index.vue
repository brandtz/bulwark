<!--
  app/pages/admin/properties/index.vue — AD-10 property pipeline (WP-B2).

  Board (BulwarkKanbanBoard) or list (BulwarkDataTable) over the tenant's
  pipeline statuses — columns, order, hues and legal transitions all come
  from the active pipeline, never a hardcoded list. View, search, status and
  assignee filters live in the URL (useFilterBar) so any slice is linkable.

  Moves: drag or keyboard on the board. Illegal transitions are refused by
  the board (canMove from allowedTransitions) and re-checked by the server.
  Targets that need a reason (On hold, Cancelled, requiresReason) open the
  AD-13 dialog before committing; everything else is optimistic and snaps
  back with a danger toast + Retry on failure. WIP limits are soft (ED-030):
  the column shows "n / limit" and a warning strip, the drop is allowed.

  Bulk (list): Change status (one dialog for the selection; illegal ones
  are skipped and reported by name), Assign, Export CSV. Map is disabled
  until geo is configured (Packet H). Phones (<768) get a status tab strip
  and one column at a time.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { FilterDef } from '~/composables/useFilterBar'
import type { Column, BulkAction } from '~/components/ui/BulwarkDataTable.vue'
import { sortRows, type SortState } from '~/composables/useDataTable'
import type { KanbanColumn } from '~/components/ui/BulwarkKanbanBoard.vue'
import type { StatusChangeDetails } from '~/components/property/PropertyStatusDialog.vue'
import { PROPERTY_STATUS_LABEL, type Property, type PropertyStatus, type PropertySummary } from '~~/shared/contracts/property'
import type { StatusPipelineNode } from '~~/shared/contracts/status-pipeline'
import type { UserAdminRow, UserMemberRow } from '~~/shared/contracts/user'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})
useHead({ title: 'Properties' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const property = useService('property')
const statusPipeline = useService('statusPipeline')
const userService = useService('user')
const toast = useToast()
const { t: tLabel } = useLabel()
const route = useRoute()
const router = useRouter()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const canEdit = computed(() => ['super_admin', 'org_admin', 'org_manager'].includes(session.value?.activeRole ?? ''))

// ---- data ------------------------------------------------------------------
const { data, pending, error, refresh } = await useAsyncData(
  () => `properties-${orgId.value}`,
  async () => {
    // Secondary data (assignee names, money) must never blank the board:
    // `optional` turns sync throws and rejections into a fallback.
    const optional = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn() } catch { return fallback }
    }
    const [list, active, users] = await Promise.all([
      property.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
      statusPipeline.getActive({ organizationId: orgId.value, entityType: 'property' }),
      optional(async () => (await userService.list({ organizationId: orgId.value, status: 'active' })).users, [] as UserAdminRow[]),
    ])
    const pipeline = active ?? await statusPipeline.bootstrap({ organizationId: orgId.value, entityType: 'property' })
    const summaries = list.rows.length ? await optional(() => property.summaries(list.rows.map((r) => r.id), orgId.value), [] as PropertySummary[]) : []
    return {
      rows: list.rows,
      total: list.total,
      statuses: [...pipeline.nodes].sort((a, b) => a.sortOrder - b.sortOrder),
      summaries,
      members: users.filter((u): u is UserMemberRow => u.kind === 'member' && ['super_admin', 'org_admin', 'org_manager', 'field'].includes(u.role)),
    }
  },
  { watch: [orgId] },
)
// A failed server render is not refetched by Nuxt on hydration; retry once
// in the browser so a transient SSR failure never leaves an empty board.
onMounted(() => { if (error.value) void refresh() })

const statuses = computed<StatusPipelineNode[]>(() => data.value?.statuses ?? [])
const nodeBy = computed(() => new Map(statuses.value.map((n) => [n.slug, n])))
const summaryBy = computed(() => new Map((data.value?.summaries ?? []).map((s) => [s.propertyId, s] as [string, PropertySummary])))
const memberBy = computed(() => new Map((data.value?.members ?? []).map((m) => [m.id, m])))

const statusLabel = (slug: string) => tLabel('status.property', slug, PROPERTY_STATUS_LABEL[slug as PropertyStatus] ?? slug.replaceAll('_', ' ').replace(/^./u, (c) => c.toUpperCase()))
const money = (cents: number | undefined) => (cents ? (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—')
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// Optimistic status overrides while a move is in flight.
const overrides = ref<Record<string, string>>({})
interface Row extends Property { [key: string]: unknown, value: number, assigneeName: string, statusLabel: string, note: string }
const allRows = computed<Row[]>(() => (data.value?.rows ?? []).map((p) => {
  const status = overrides.value[p.id] ?? p.status
  return {
    ...p,
    status,
    value: summaryBy.value.get(p.id)?.contractValueCents ?? 0,
    assigneeName: p.assigneeUserId ? memberBy.value.get(p.assigneeUserId)?.fullName ?? 'Unknown user' : '',
    statusLabel: statusLabel(status),
    note: p.statusReason && (status === 'on_hold' || status === 'cancelled') ? `${statusLabel(status)}: ${p.statusReason}` : `Updated ${shortDate(p.updatedAt)}`,
  }
}))

// ---- view + filters (URL) ------------------------------------------------------
const VIEWS = ['board', 'list'] as const
type View = typeof VIEWS[number]
const view = computed<View>({
  get: () => (VIEWS.includes(route.query.view as View) ? route.query.view as View : 'board'),
  set: (v) => { void router.replace({ query: { ...route.query, view: v === 'board' ? undefined : v } }) },
})
const VIEW_OPTIONS = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
  { value: 'map', label: 'Map', disabled: true, title: 'Map needs a geo provider (Settings → Providers)' },
]

const filterDefs = computed<FilterDef[]>(() => [
  { key: 'q', label: 'Search properties', type: 'text' },
  { key: 'status', label: 'Status', type: 'multiselect', options: statuses.value.map((n) => ({ value: n.slug, label: statusLabel(n.slug) })) },
  {
    key: 'assignee',
    label: 'Assignee',
    type: 'select',
    options: [{ value: 'none', label: 'Unassigned' }, ...(data.value?.members ?? []).map((m) => ({ value: m.id, label: m.fullName }))],
  },
])
const filters = useFilterBar(() => filterDefs.value)

const rows = computed(() => {
  const m = filters.model.value
  const q = m.q?.[0]?.toLowerCase()
  const wanted = m.status?.length ? new Set(m.status) : null
  const who = m.assignee?.[0]
  return allRows.value.filter((r) =>
    (!q || `${r.addressLine1} ${r.city}`.toLowerCase().includes(q))
    && (!wanted || wanted.has(r.status))
    && (!who || (who === 'none' ? !r.assigneeUserId : r.assigneeUserId === who)))
})
const pipelineValue = computed(() => rows.value.reduce((s, r) => s + r.value, 0))

// ---- board -----------------------------------------------------------------------
const collapsed = ref<Set<string>>(new Set())
const columns = computed<KanbanColumn[]>(() => statuses.value
  .filter((n) => !filters.model.value.status?.length || filters.model.value.status.includes(n.slug))
  .map((n) => ({ status: { id: n.slug, label: statusLabel(n.slug), hue: n.hue }, wip: n.wipLimit ?? undefined, collapsed: collapsed.value.has(n.slug) })))
const overLimit = computed(() => columns.value.filter((c) => c.wip && rows.value.filter((r) => r.status === c.status.id).length >= c.wip))
function toggleCollapse(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

function canMove(_card: Row, from: string, to: string): true | string {
  if (!canEdit.value) return 'You can view the pipeline but not change it'
  return nodeBy.value.get(from)?.allowedTransitions.includes(to) ? true : `Not allowed from ${statusLabel(from)}`
}
const needsDialog = (n: StatusPipelineNode | undefined) => !!n && (n.requiresReason || n.slug === 'on_hold' || n.slug === 'cancelled')

// ---- status changes (single + bulk share the AD-13 dialog) ------------------------------
const dialog = reactive({ open: false, target: null as StatusPipelineNode | null, ids: [] as string[], fromLabel: '', saving: false, error: '' })
// Bulk rows skipped (illegal) before the dialog opened are reported with its results.
const pendingSkipped = ref<Array<{ id: string, ok: boolean, error: string }>>([])
watch(() => dialog.open, (open) => {
  if (!open) pendingSkipped.value = []
})
const openInvoices = computed(() => dialog.ids.reduce((n, id) => n + (summaryBy.value.get(id)?.openInvoiceCount ?? 0), 0))

async function commit(ids: string[], to: string, details: StatusChangeDetails = {}) {
  const results = await Promise.allSettled(ids.map((id) =>
    property.updateStatus(id, to, orgId.value, details.reason, { note: details.note, resumeOn: details.resumeOn })))
  return results.map((r, i) => ({ id: ids[i]!, ok: r.status === 'fulfilled', error: r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : '' }))
}

async function moveOne(card: Row, to: string) {
  const node = nodeBy.value.get(to)
  if (needsDialog(node)) {
    Object.assign(dialog, { open: true, target: node, ids: [card.id], fromLabel: statusLabel(card.status), saving: false, error: '' })
    return
  }
  overrides.value = { ...overrides.value, [card.id]: to }
  const [res] = await commit([card.id], to)
  if (res?.ok) {
    await refresh()
  } else {
    toast.push({ title: `Couldn't move ${card.addressLine1}`, body: res?.error.replace(/^.*?: /u, '') ?? '', tone: 'error', action: { label: 'Retry', onClick: () => void moveOne(card, to) } })
  }
  const { [card.id]: _dropped, ...rest } = overrides.value
  overrides.value = rest
}

async function confirmDialog(details: StatusChangeDetails) {
  if (!dialog.target) return
  dialog.saving = true
  dialog.error = ''
  const results = await commit(dialog.ids, dialog.target.slug, details)
  dialog.saving = false
  const failed = results.filter((r) => !r.ok)
  if (failed.length === results.length) {
    dialog.error = failed[0]?.error.replace(/^.*?: /u, '') || 'The change was not saved.'
    return
  }
  const to = dialog.target.slug
  reportBulk([...results, ...pendingSkipped.value], to)
  dialog.open = false
  await refresh()
}

function reportBulk(results: Array<{ id: string, ok: boolean, error: string }>, to: string) {
  const ok = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  if (results.length === 1 && !failed.length) return
  const name = (id: string) => allRows.value.find((r) => r.id === id)?.addressLine1 ?? id
  toast.push({
    title: `${ok} moved to ${statusLabel(to)}${failed.length ? `, ${failed.length} skipped` : ''}`,
    body: failed.map((f) => `${name(f.id)}: ${f.error.replace(/^.*?: /u, '')}`).join('\n'),
    tone: failed.length ? 'warning' : 'success',
    duration: failed.length ? 8000 : 4000,
  })
}

// ---- list + bulk ----------------------------------------------------------------------
const tableCols: Column[] = [
  { key: 'addressLine1', label: 'Property', sortable: true },
  { key: 'statusLabel', label: 'Status', sortable: true },
  { key: 'city', label: 'City', sortable: true },
  { key: 'assigneeName', label: 'Assignee', sortable: true },
  { key: 'value', label: 'Contract value', sortable: true, numeric: true, align: 'end' },
  { key: 'updatedAt', label: 'Updated', sortable: true },
]
const sort = ref<SortState | null>(null)
const sorted = computed(() => sortRows(rows.value, sort.value))
const bulkActions = computed<BulkAction[]>(() => canEdit.value
  ? [{ label: 'Change status', value: 'status' }, { label: 'Assign', value: 'assign' }, { label: 'Export CSV', value: 'export' }]
  : [{ label: 'Export CSV', value: 'export' }])

const bulkPick = reactive({ open: false, kind: 'status' as 'status' | 'assign', ids: [] as string[], value: null as string | null, error: '' })
function onBulk(action: string, sel: { keys: string[], allMatching: boolean }) {
  const ids = sel.allMatching ? rows.value.map((r) => r.id) : sel.keys
  if (action === 'export') return exportCsv(rows.value.filter((r) => ids.includes(r.id)))
  Object.assign(bulkPick, { open: true, kind: action, ids, value: null, error: '' })
}
const statusChoices = computed(() => statuses.value.map((n) => ({ value: n.slug, label: statusLabel(n.slug) })))
const assigneeChoices = computed(() => [{ value: 'none', label: 'Unassigned' }, ...(data.value?.members ?? []).map((m) => ({ value: m.id, label: m.fullName }))])

async function applyBulk() {
  if (!bulkPick.value) {
    bulkPick.error = bulkPick.kind === 'status' ? 'Choose a status.' : 'Choose an assignee.'
    return
  }
  bulkPick.open = false
  if (bulkPick.kind === 'assign') {
    const assigneeUserId = bulkPick.value === 'none' ? null : bulkPick.value
    const results = await Promise.allSettled(bulkPick.ids.map((id) => property.update({ id, organizationId: orgId.value, assigneeUserId })))
    const failed = results.filter((r) => r.status === 'rejected').length
    toast.push({ title: `${results.length - failed} assigned${failed ? `, ${failed} failed` : ''}`, tone: failed ? 'warning' : 'success' })
    await refresh()
    return
  }
  const to = bulkPick.value
  const node = nodeBy.value.get(to)
  // Rows whose current status cannot reach the target are reported, not sent.
  const illegal = bulkPick.ids.filter((id) => {
    const from = allRows.value.find((r) => r.id === id)?.status ?? ''
    return from !== to && !nodeBy.value.get(from)?.allowedTransitions.includes(to)
  })
  const legal = bulkPick.ids.filter((id) => !illegal.includes(id))
  const skipped = illegal.map((id) => ({ id, ok: false, error: `Not allowed from ${statusLabel(allRows.value.find((r) => r.id === id)?.status ?? '')}` }))
  if (!legal.length) return reportBulk(skipped, to)
  if (needsDialog(node)) {
    pendingSkipped.value = skipped
    Object.assign(dialog, { open: true, target: node, ids: legal, fromLabel: '', saving: false, error: '' })
    return
  }
  reportBulk([...(await commit(legal, to)), ...skipped], to)
  await refresh()
}

const { download } = useCsvExport()
function exportCsv(list: Row[] = rows.value) {
  download({
    rows: list,
    filename: `properties-${new Date().toISOString().slice(0, 10)}.csv`,
    columns: [
      { header: 'Address', value: (r) => r.addressLine1 },
      { header: 'City', value: (r) => r.city },
      { header: 'State', value: (r) => r.state },
      { header: 'Status', value: (r) => r.statusLabel },
      { header: 'Assignee', value: (r) => r.assigneeName },
      { header: 'Contract value', value: (r) => (r.value / 100).toFixed(2) },
      { header: 'Updated', value: (r) => r.updatedAt },
    ],
  })
}

// ---- phones: one status at a time -------------------------------------------------------
const narrow = ref(false)
const phoneStatus = ref<string | null>(null)
onMounted(() => {
  const mq = window.matchMedia('(max-width: 767px)')
  narrow.value = mq.matches
  mq.addEventListener('change', (e) => { narrow.value = e.matches })
})
const phoneColumn = computed(() => phoneStatus.value ?? columns.value[0]?.status.id ?? '')

// ---- saved views (SH-22) -----------------------------------------------------------------
const currentFilters = computed(() => ({ view: view.value, ...filters.model.value }))
function applySavedView(payload: { filters: Record<string, unknown> }) {
  const f = payload.filters ?? {}
  const v = f.view === 'kanban' ? 'board' : f.view
  const query: Record<string, string | string[]> = {}
  for (const k of ['q', 'status', 'assignee']) {
    const val = f[k]
    if (typeof val === 'string' || (Array.isArray(val) && val.every((x) => typeof x === 'string'))) query[k] = val as string | string[]
  }
  if (v === 'list') query.view = 'list'
  void router.replace({ query })
}
</script>

<template>
  <div class="flex flex-col gap-4 p-4 md:p-6 min-w-0" data-testid="properties-pipeline">
    <BulwarkPageHeader
      title="Properties"
      :meta="`${rows.length} ${rows.length === 1 ? 'property' : 'properties'} · ${money(pipelineValue)} pipeline value`"
    >
      <template #actions>
        <BulwarkButton variant="secondary" data-testid="pipeline-export" @click="exportCsv()">
          <BulwarkIcon name="download" size="sm" /> Export
        </BulwarkButton>
        <NuxtLink v-if="canEdit" to="/admin/properties/new" class="bw-btn bw-btn--primary" data-testid="new-property-button">
          <BulwarkIcon name="plus" size="sm" /> New property
        </NuxtLink>
      </template>
    </BulwarkPageHeader>

    <div class="flex items-center gap-3 flex-wrap">
      <SavedViewsMenu entity-type="property" :current-filters="currentFilters" @apply="applySavedView" />
      <BulwarkSegmentedControl v-model="view" :options="VIEW_OPTIONS" aria-label="Pipeline layout" data-testid="pipeline-view-toggle" />
    </div>

    <BulwarkFilterBar
      :filters="filterDefs"
      :model-value="filters.model.value"
      :total="data?.total ?? 0"
      :matching="rows.length"
      :saved-views="false"
      search-placeholder="Search address or city"
      @update:model-value="filters.set"
      @clear="filters.clear"
    />

    <BulwarkBanner v-if="error" tone="danger" :action="{ label: 'Retry', fn: () => refresh() }">
      The pipeline didn't load.
    </BulwarkBanner>
    <BulwarkBanner v-if="overLimit.length" tone="warning" data-testid="wip-warning">
      At or over the WIP limit: {{ overLimit.map((c) => `${c.status.label} (${rows.filter((r) => r.status === c.status.id).length} / ${c.wip})`).join(', ') }}
    </BulwarkBanner>

    <div v-if="pending && !data" class="flex gap-4" data-testid="properties-loading">
      <BulwarkSkeleton v-for="i in 4" :key="i" class="w-[260px] h-64 shrink-0" />
    </div>

    <EmptyState
      v-else-if="data && !data.rows.length"
      title="No properties yet"
      body="Add the first property to start the pipeline."
      :primary="canEdit ? { label: 'New property', action: () => navigateTo('/admin/properties/new') } : null"
      data-testid="pipeline-empty"
    />

    <template v-else-if="view === 'board'">
      <div v-if="narrow" class="flex flex-col gap-3">
        <div class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Status">
          <button
            v-for="c in columns"
            :key="c.status.id"
            type="button"
            role="tab"
            class="bw-chip shrink-0 min-h-12"
            :class="phoneColumn === c.status.id && 'bw-chip--accent'"
            :aria-selected="phoneColumn === c.status.id"
            @click="phoneStatus = c.status.id"
          >
            {{ c.status.label }} · {{ rows.filter((r) => r.status === c.status.id).length }}
          </button>
        </div>
        <ul class="flex flex-col gap-2" :aria-label="statusLabel(phoneColumn)">
          <li v-for="r in rows.filter((x) => x.status === phoneColumn)" :key="r.id">
            <NuxtLink :to="`/admin/properties/${r.id}`" class="bw-card bw-card--sm bw-card--clickable block min-h-[76px]">
              <PropertyBoardCard :row="r" :money="money" />
            </NuxtLink>
          </li>
          <li v-if="!rows.some((x) => x.status === phoneColumn)" class="bw-help text-center py-6">Nothing in {{ statusLabel(phoneColumn) }}</li>
        </ul>
      </div>
      <BulwarkKanbanBoard
        v-else
        :columns="columns"
        :cards="rows"
        title-key="addressLine1"
        item-noun="properties"
        :can-move="canMove"
        :card-href="(c: Row) => `/admin/properties/${c.id}`"
        :draggable="canEdit"
        @move="(card: Row, _from: string, to: string) => moveOne(card, to)"
        @collapse="toggleCollapse"
      >
        <template #card="{ card }">
          <PropertyBoardCard :row="card as Row" :money="money" />
        </template>
      </BulwarkKanbanBoard>
    </template>

    <BulwarkDataTable
      v-else
      :columns="tableCols"
      :rows="sorted"
      title-key="addressLine1"
      selectable
      :bulk-actions="bulkActions"
      :sort="sort"
      :total="rows.length"
      :loading="pending && !data"
      :empty-flavor="filters.active.value ? 'no-results' : 'first-run'"
      caption="Properties"
      data-testid="pipeline-list"
      @sort="(s: SortState | null) => (sort = s)"
      @bulk="onBulk"
    >
      <template #cell-addressLine1="{ row }">
        <NuxtLink :to="`/admin/properties/${row.id}`" class="bw-link font-medium" data-testid="property-card" :data-property-id="row.id">{{ row.addressLine1 }}</NuxtLink>
      </template>
      <template #cell-statusLabel="{ row }">
        <StatusBadge :hue="nodeBy.get(row.status)?.hue ?? 'gray'" :label="row.statusLabel" />
      </template>
      <template #cell-assigneeName="{ row }">
        <span v-if="row.assigneeName" class="inline-flex items-center gap-2"><BulwarkAvatar :name="row.assigneeName" size="sm" />{{ row.assigneeName }}</span>
        <span v-else class="bw-help">Unassigned</span>
      </template>
      <template #cell-value="{ row }">{{ money(row.value) }}</template>
      <template #cell-updatedAt="{ row }">{{ shortDate(row.updatedAt) }}</template>
    </BulwarkDataTable>

    <PropertyStatusDialog
      :open="dialog.open"
      :target="dialog.target"
      :target-label="dialog.target ? statusLabel(dialog.target.slug) : ''"
      :from-label="dialog.fromLabel"
      :count="dialog.ids.length"
      :open-invoice-count="openInvoices"
      :saving="dialog.saving"
      :error="dialog.error"
      @confirm="confirmDialog"
      @close="dialog.open = false"
    />

    <BulwarkModal
      :open="bulkPick.open"
      :title="bulkPick.kind === 'status' ? `Change status (${bulkPick.ids.length})` : `Assign (${bulkPick.ids.length})`"
      size="sm"
      @close="bulkPick.open = false"
    >
      <BulwarkSelect
        v-model="bulkPick.value"
        :label="bulkPick.kind === 'status' ? 'New status' : 'Assignee'"
        :options="bulkPick.kind === 'status' ? statusChoices : assigneeChoices"
        :error="bulkPick.error"
        data-testid="bulk-pick"
      />
      <template #footer>
        <BulwarkButton variant="secondary" @click="bulkPick.open = false">Cancel</BulwarkButton>
        <BulwarkButton data-testid="bulk-apply" @click="applyBulk">Apply to {{ bulkPick.ids.length }}</BulwarkButton>
      </template>
    </BulwarkModal>
  </div>
</template>

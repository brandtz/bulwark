<!--
  app/pages/settings/audit-log.vue — filterable org audit log
  (W2-4 / EH-H Part B / ADR-0021).

  # Decisions
    - Server-side filter + pagination via IAuditService.filter.
    - Filters: dateFrom, dateTo, actorUserId, entityType, action,
      entityId, free-text search. Page size 50.
    - "Export CSV" downloads the same filtered set (capped server-side
      at 10k rows). Triggers a Blob download in the browser.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { AuditFilterInput, AuditLogRow } from '~~/shared/contracts/audit'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})
useHead({ title: 'Audit log' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const auditService = useService('audit')
const { error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

interface FilterForm {
  dateFrom: string
  dateTo: string
  actorUserId: string
  entityType: string
  action: '' | 'create' | 'update' | 'delete' | 'state_change'
  entityId: string
  search: string
}
const form = ref<FilterForm>({
  dateFrom: '',
  dateTo: '',
  actorUserId: '',
  entityType: '',
  action: '',
  entityId: '',
  search: '',
})

const page = ref(1)
const pageSize = 50
const rows = ref<AuditLogRow[]>([])
const total = ref(0)
const loading = ref(false)

function buildInput(): AuditFilterInput {
  const input: AuditFilterInput = {
    organizationId: orgId.value,
    page: page.value,
    pageSize,
  }
  if (form.value.dateFrom) input.dateFrom = new Date(form.value.dateFrom).toISOString()
  if (form.value.dateTo) input.dateTo = new Date(form.value.dateTo).toISOString()
  if (form.value.actorUserId) input.actorUserId = form.value.actorUserId
  if (form.value.entityType) input.entityType = form.value.entityType
  if (form.value.action) input.action = form.value.action
  if (form.value.entityId) input.entityId = form.value.entityId
  if (form.value.search) input.search = form.value.search
  return input
}

async function load() {
  loading.value = true
  try {
    const r = await auditService.filter(buildInput())
    rows.value = r.rows
    total.value = r.total
  } catch (err) {
    toastError('Could not load audit log', (err as Error).message)
  } finally {
    loading.value = false
  }
}
await load()

function onApplyFilters() {
  page.value = 1
  void load()
}

function onClear() {
  form.value = { dateFrom: '', dateTo: '', actorUserId: '', entityType: '', action: '', entityId: '', search: '' }
  page.value = 1
  void load()
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
function changePage(delta: number) {
  const next = page.value + delta
  if (next < 1 || next > totalPages.value) return
  page.value = next
  void load()
}

const exporting = ref(false)
async function onExport() {
  exporting.value = true
  try {
    const { page: _p, pageSize: _ps, ...rest } = buildInput()
    void _p; void _ps
    const csv = await auditService.exportCsv(rest)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    toastError('Export failed', (err as Error).message)
  } finally {
    exporting.value = false
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="settings-audit-log">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Audit log' }]"
    />
    <header class="mt-2 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-display">Audit log</h1>
        <p class="text-body text-text-secondary mt-1">
          Read-only feed of writes across the org.
        </p>
      </div>
      <BulwarkButton
        variant="secondary"
        :disabled="exporting"
        data-testid="audit-export-button"
        @click="onExport"
      >{{ exporting ? 'Exporting…' : 'Export CSV' }}</BulwarkButton>
    </header>

    <BulwarkCard padding="md" class="mt-4">
      <form class="grid grid-cols-1 md:grid-cols-4 gap-3" @submit.prevent="onApplyFilters">
        <div>
          <label class="block text-tiny font-medium text-text-secondary mb-1">From</label>
          <input v-model="form.dateFrom" type="date" class="w-full rounded-input border border-border-default bg-surface-base px-2 py-1 text-small" data-testid="audit-filter-from" />
        </div>
        <div>
          <label class="block text-tiny font-medium text-text-secondary mb-1">To</label>
          <input v-model="form.dateTo" type="date" class="w-full rounded-input border border-border-default bg-surface-base px-2 py-1 text-small" data-testid="audit-filter-to" />
        </div>
        <div>
          <label class="block text-tiny font-medium text-text-secondary mb-1">Entity type</label>
          <input v-model="form.entityType" type="text" placeholder="quote" class="w-full rounded-input border border-border-default bg-surface-base px-2 py-1 text-small" data-testid="audit-filter-entity-type" />
        </div>
        <div>
          <label class="block text-tiny font-medium text-text-secondary mb-1">Action</label>
          <select v-model="form.action" class="w-full rounded-input border border-border-default bg-surface-base px-2 py-1 text-small" data-testid="audit-filter-action">
            <option value="">(any)</option>
            <option value="create">create</option>
            <option value="update">update</option>
            <option value="delete">delete</option>
            <option value="state_change">state_change</option>
          </select>
        </div>
        <div>
          <label class="block text-tiny font-medium text-text-secondary mb-1">Actor user ID</label>
          <input v-model="form.actorUserId" type="text" class="w-full rounded-input border border-border-default bg-surface-base px-2 py-1 text-small font-mono" data-testid="audit-filter-actor" />
        </div>
        <div>
          <label class="block text-tiny font-medium text-text-secondary mb-1">Entity ID</label>
          <input v-model="form.entityId" type="text" class="w-full rounded-input border border-border-default bg-surface-base px-2 py-1 text-small font-mono" data-testid="audit-filter-entity-id" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-tiny font-medium text-text-secondary mb-1">Search</label>
          <input v-model="form.search" type="text" placeholder="full-text across metadata" class="w-full rounded-input border border-border-default bg-surface-base px-2 py-1 text-small" data-testid="audit-filter-search" />
        </div>
        <div class="md:col-span-4 flex justify-end gap-2">
          <BulwarkButton type="button" variant="secondary" size="sm" @click="onClear">Clear</BulwarkButton>
          <BulwarkButton type="submit" variant="primary" size="sm" data-testid="audit-apply-filters">Apply filters</BulwarkButton>
        </div>
      </form>
    </BulwarkCard>

    <BulwarkCard v-if="loading" padding="md" class="mt-4">
      <p class="text-small text-text-secondary">Loading…</p>
    </BulwarkCard>

    <BulwarkCard v-else-if="rows.length === 0" padding="md" class="mt-4">
      <p class="text-body text-text-secondary" data-testid="audit-empty">
        No activity matches these filters.
      </p>
    </BulwarkCard>

    <BulwarkCard v-else padding="none" class="mt-4">
      <ul class="divide-y divide-border-default">
        <li
          v-for="row in rows"
          :key="row.id"
          class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2"
          data-testid="audit-row"
        >
          <div class="md:col-span-3 text-small text-text-secondary">
            {{ formatTimestamp(row.createdAt) }}
          </div>
          <div class="md:col-span-3">
            <span class="inline-flex items-center rounded-pill bg-status-info/10 text-status-info px-2.5 py-1 text-tiny font-medium">
              {{ row.entityType }}
            </span>
            <span class="ml-2 text-small text-text-secondary">{{ row.action }}</span>
          </div>
          <div class="md:col-span-3 text-tiny text-text-secondary font-mono truncate">
            {{ row.entityId }}
          </div>
          <div class="md:col-span-3 text-tiny text-text-secondary font-mono truncate">
            {{ row.actorUserId ?? '—' }}
          </div>
        </li>
      </ul>
    </BulwarkCard>

    <div class="mt-4 flex items-center justify-between text-small text-text-secondary" data-testid="audit-pagination">
      <span>{{ total }} total · page {{ page }} of {{ totalPages }}</span>
      <div class="flex gap-2">
        <BulwarkButton size="sm" variant="secondary" :disabled="page === 1" data-testid="audit-prev-page" @click="changePage(-1)">Prev</BulwarkButton>
        <BulwarkButton size="sm" variant="secondary" :disabled="page >= totalPages" data-testid="audit-next-page" @click="changePage(1)">Next</BulwarkButton>
      </div>
    </div>
  </div>
</template>
<!--
  app/pages/settings/labels.vue — CMS label registry editor (EH-B / W1-2 / ADR-0014).

  # Decisions (ADR-0008)
    - Admin-only per ROLE_GROUPS.admin. The role middleware redirects
      field/sub/viewer personas to /403.
    - Tabs per top-level namespace family. Each tab renders a table of
      `(key, default, override, description)` rows. The full default
      catalog comes from `DEFAULT_LABELS` (shared/labels/defaults.ts)
      so adding a new default in code surfaces it here automatically.
    - Inline-edit pattern: every row holds a local draft value; "Save
      all changes" pushes the dirty set as a single `bulkUpsert`. Per-row
      "Reset to default" calls `delete(id)` for the override.
    - We deliberately group by namespace — bulkUpsert is namespace-
      scoped in spirit (the editor only ever shows one namespace per
      tab) so a partial save can't accidentally drop a row from another
      namespace.

  # Decision cast down
    - Rejected: an autosave-on-blur model. Sponsor explicit ask is "save
      all" so admins can stage many edits and commit atomically.
    - Rejected: a JSON-import-export round trip. Useful but not required
      for Phase 1; tracked in the W1-2 handoff.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { DEFAULT_LABELS } from '~~/shared/labels/defaults'
import type { Label, LabelNamespace } from '~~/shared/contracts/label'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Labels' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const labelSvc = useService('label')
const labelComposable = useLabel()
const { success: toastSuccess } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

// ----------------------------------------------------------------------------
// Tab grouping. The label registry has 15 namespaces; we collapse them
// into 7 admin-friendly tab buckets.
// ----------------------------------------------------------------------------
type TabKey = 'statuses' | 'trades' | 'roles' | 'programs' | 'emails' | 'pdfs' | 'ctas'
const TAB_NAMESPACES: Record<TabKey, LabelNamespace[]> = {
  statuses: [
    'status.property',
    'status.quote',
    'status.work_order',
    'status.invoice',
    'status.compliance',
    'status.job',
  ],
  trades: ['trade'],
  roles: ['role'],
  programs: ['program'],
  emails: ['email.subject', 'email.body', 'sms.body'],
  pdfs: ['pdf.footer', 'pdf.declaration'],
  ctas: ['cta'],
}
const TABS = [
  { value: 'statuses', label: 'Statuses' },
  { value: 'trades', label: 'Trades' },
  { value: 'roles', label: 'Roles' },
  { value: 'programs', label: 'Programs' },
  { value: 'emails', label: 'Emails / SMS' },
  { value: 'pdfs', label: 'PDFs' },
  { value: 'ctas', label: 'CTAs' },
] as const
const activeTab = ref<TabKey>('statuses')

// ----------------------------------------------------------------------------
// Row model.
//   - `defaultValue` from DEFAULT_LABELS in code.
//   - `override` from the DB list call; null when no override exists.
//   - `draft` is the editable value the admin types into the row.
// ----------------------------------------------------------------------------
interface LabelRowVM {
  namespace: LabelNamespace
  key: string
  defaultValue: string
  override: Label | null
  draft: string
  description: string
}

const allRows = ref<LabelRowVM[]>([])
const serverError = ref('')
const saving = ref(false)

function flatKeyOf(ns: string, k: string): string {
  return `${ns}.${k}`
}

function namespacesForTab(tab: TabKey): LabelNamespace[] {
  return TAB_NAMESPACES[tab]
}

function buildRows(overrides: Label[]): LabelRowVM[] {
  // Index overrides by `${ns}.${key}` for O(1) lookup against the
  // defaults catalog.
  const byKey = new Map<string, Label>()
  for (const o of overrides) byKey.set(flatKeyOf(o.namespace, o.key), o)
  const rows: LabelRowVM[] = []
  for (const [flat, def] of Object.entries(DEFAULT_LABELS)) {
    const dotIdx = flat.lastIndexOf('.')
    // For dotted namespaces like `status.property` we still want the last
    // segment as the key — but we have multi-segment namespaces (e.g.
    // `status.work_order.slot`). Look up the longest known namespace.
    let ns: LabelNamespace | null = null
    let key = ''
    const namespaceList = Object.values(TAB_NAMESPACES).flat() as string[]
    // Match by longest-prefix.
    namespaceList.sort((a, b) => b.length - a.length)
    for (const candidate of namespaceList) {
      if (flat.startsWith(candidate + '.')) {
        ns = candidate as LabelNamespace
        key = flat.slice(candidate.length + 1)
        break
      }
    }
    if (!ns) {
      // Unrecognized namespace prefix — bucket under the bare segment
      // (shouldn't happen because the labels test enforces enum coverage,
      // but defensive).
      ns = flat.slice(0, dotIdx) as LabelNamespace
      key = flat.slice(dotIdx + 1)
    }
    const override = byKey.get(flat) ?? null
    rows.push({
      namespace: ns,
      key,
      defaultValue: def,
      override,
      draft: override?.value ?? def,
      description: override?.description ?? '',
    })
  }
  return rows.sort((a, b) => {
    if (a.namespace !== b.namespace) return a.namespace.localeCompare(b.namespace)
    return a.key.localeCompare(b.key)
  })
}

async function load() {
  if (!orgId.value) return
  const { rows } = await labelSvc.list({ organizationId: orgId.value, locale: 'en-US' })
  allRows.value = buildRows(rows)
}
await load()

const visibleRows = computed(() =>
  allRows.value.filter((r) => namespacesForTab(activeTab.value).includes(r.namespace)),
)

const dirtyRows = computed(() =>
  allRows.value.filter(
    (r) => r.draft.trim() !== '' && r.draft !== (r.override?.value ?? r.defaultValue),
  ),
)

async function onSaveAll() {
  if (!dirtyRows.value.length) return
  serverError.value = ''
  saving.value = true
  try {
    await labelSvc.bulkUpsert({
      organizationId: orgId.value,
      locale: 'en-US',
      entries: dirtyRows.value.map((r) => ({
        namespace: r.namespace,
        key: r.key,
        value: r.draft.trim(),
        description: r.description ? r.description : undefined,
      })),
    })
    await labelComposable.reload()
    await load()
    toastSuccess('Labels saved', 'Your overrides are live across the app.')
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not save labels.'
  } finally {
    saving.value = false
  }
}

async function onResetRow(row: LabelRowVM) {
  if (!row.override) {
    row.draft = row.defaultValue
    return
  }
  serverError.value = ''
  try {
    await labelSvc.delete(row.override.id, orgId.value)
    await labelComposable.reload()
    await load()
    toastSuccess('Override removed', `${row.namespace}.${row.key} reverted to default.`)
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not reset.'
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="settings-labels">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Labels' }]"
    />
    <header class="mt-2 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-display">Labels</h1>
        <p class="text-body text-text-secondary mt-1">
          Rename any user-facing copy for your organization. Overrides apply
          everywhere the app references the label.
        </p>
      </div>
      <BulwarkButton
        variant="primary"
        :disabled="!dirtyRows.length || saving"
        :loading="saving"
        data-testid="labels-save-all-button"
        @click="onSaveAll"
      >
        Save {{ dirtyRows.length ? `(${dirtyRows.length})` : 'all changes' }}
      </BulwarkButton>
    </header>

    <p
      v-if="serverError"
      class="mt-3 text-small text-status-error"
      data-testid="labels-error"
    >
      {{ serverError }}
    </p>

    <BulwarkTabs
      v-model="activeTab"
      :tabs="TABS.map((t) => ({ value: t.value, label: t.label }))"
      class="mt-6"
      aria-label="Label namespaces"
    >
      <template #[`tab-${activeTab}`]>
        <BulwarkCard padding="none">
          <table class="w-full text-small" data-testid="labels-table">
            <thead class="text-text-secondary">
              <tr class="text-left">
                <th class="p-3">Key</th>
                <th class="p-3">Default</th>
                <th class="p-3">Override</th>
                <th class="p-3">Description</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in visibleRows"
                :key="`${row.namespace}.${row.key}`"
                class="border-t border-border-default"
                data-testid="labels-row"
                :data-namespace="row.namespace"
                :data-key="row.key"
              >
                <td class="p-3 align-top">
                  <code class="text-tiny text-text-secondary">{{ row.namespace }}.{{ row.key }}</code>
                </td>
                <td class="p-3 align-top text-text-secondary">{{ row.defaultValue }}</td>
                <td class="p-3 align-top">
                  <input
                    v-model="row.draft"
                    type="text"
                    class="w-full rounded-card border border-border-default px-2 py-1 text-body"
                    data-testid="labels-override-input"
                  >
                </td>
                <td class="p-3 align-top">
                  <input
                    v-model="row.description"
                    type="text"
                    class="w-full rounded-card border border-border-default px-2 py-1 text-small"
                    placeholder="Internal note"
                  >
                </td>
                <td class="p-3 align-top text-right">
                  <button
                    v-if="row.override"
                    type="button"
                    class="text-small text-primary-700 hover:text-primary underline"
                    data-testid="labels-reset-button"
                    @click="onResetRow(row)"
                  >
                    Reset
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </BulwarkCard>
      </template>
    </BulwarkTabs>
  </div>
</template>

<!--
  app/pages/settings/saved-views.vue — admin manage page for saved-views
  (W4-1 / EH-P / ADR-0033).

  # Decisions (ADR-0008, ADR-0033)
    - Surfaces both the requesting user's private rows and every shared
      org row in the same table. The mock + real services already
      enforce visibility via `listForUser`.
    - Inline actions: toggle share (sets `userId` to null or current),
      toggle default, soft-delete.
    - Per-entity-type grouping so admins skim quickly. We iterate the
      contract's `SavedViewEntityTypeSchema` for stable ordering.

  # Decision cast down
    - Editing the filter shape inline. Rejected — the filter object is
      page-specific (status + future fields); a generic JSON editor is
      a power-user tool we don't need at v1.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { SavedViewEntityTypeSchema, type SavedView, type SavedViewEntityType } from '~~/shared/contracts/saved-view'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Saved views' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const savedView = useService('savedView')
const { t } = useLabel()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const rowsByType = ref<Record<SavedViewEntityType, SavedView[]>>(
  Object.fromEntries(
    SavedViewEntityTypeSchema.options.map((t) => [t, [] as SavedView[]]),
  ) as Record<SavedViewEntityType, SavedView[]>,
)
const loading = ref(false)
const errorMsg = ref<string | null>(null)

async function refreshAll() {
  if (!orgId.value || !userId.value) return
  loading.value = true
  errorMsg.value = null
  try {
    const next = Object.fromEntries(
      SavedViewEntityTypeSchema.options.map((t) => [t, [] as SavedView[]]),
    ) as Record<SavedViewEntityType, SavedView[]>
    await Promise.all(
      SavedViewEntityTypeSchema.options.map(async (et) => {
        next[et] = await savedView.list({
          organizationId: orgId.value,
          userId: userId.value,
          entityType: et,
        })
      }),
    )
    rowsByType.value = next
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Could not load saved views'
  } finally {
    loading.value = false
  }
}

await refreshAll()

async function toggleDefault(v: SavedView) {
  if (v.isDefault) {
    // No "clear default" verb on the contract; we update isDefault=false
    // (the service accepts the flag).
    await savedView.update({ id: v.id, organizationId: orgId.value, isDefault: false })
  } else {
    await savedView.setDefault(v.id, orgId.value)
  }
  await refreshAll()
}

async function remove(v: SavedView) {
  if (!confirm(`Delete view "${v.name}"?`)) return
  await savedView.softDelete(v.id, orgId.value)
  await refreshAll()
}

function entityLabel(et: SavedViewEntityType): string {
  switch (et) {
    case 'work-order':
      return 'Work orders'
    case 'subcontractor':
      return 'Subcontractors'
    default:
      return et.charAt(0).toUpperCase() + et.slice(1) + 's'
  }
}

function nonEmptyGroups() {
  return SavedViewEntityTypeSchema.options.filter(
    (et) => (rowsByType.value[et]?.length ?? 0) > 0,
  )
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-4xl mx-auto" data-testid="saved-views-page">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Settings', to: '/settings' },
        { label: t('saved-views', 'title', 'Views') },
      ]"
    />

    <header class="mt-4">
      <h1 class="text-display">Saved views</h1>
      <p class="text-body text-text-secondary mt-1">
        Manage your private views and any views shared org-wide.
      </p>
    </header>

    <p
      v-if="errorMsg"
      role="alert"
      class="mt-4 rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
    >{{ errorMsg }}</p>

    <p v-if="loading" class="mt-6 text-small text-text-secondary">Loading…</p>

    <div v-else class="mt-6 flex flex-col gap-6">
      <template v-for="et in nonEmptyGroups()" :key="et">
        <section :data-testid="`saved-views-section-${et}`">
          <h2 class="text-h2 mb-2">{{ entityLabel(et) }}</h2>
          <BulwarkCard padding="none">
            <ul class="divide-y divide-border">
              <li
                v-for="v in rowsByType[et]"
                :key="v.id"
                class="p-3 flex flex-wrap items-center justify-between gap-3"
                data-testid="saved-views-row"
                :data-view-id="v.id"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="text-body font-medium truncate">{{ v.name }}</p>
                    <span
                      v-if="v.userId === null"
                      class="inline-flex items-center rounded-pill bg-surface-muted text-text-secondary px-2 py-0.5 text-tiny"
                    >{{ t('saved-views', 'shared-badge', 'Shared') }}</span>
                    <span
                      v-if="v.isDefault"
                      class="inline-flex items-center rounded-pill bg-primary text-white px-2 py-0.5 text-tiny"
                    >{{ t('saved-views', 'default-badge', 'Default') }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    class="text-small text-primary hover:underline"
                    data-testid="saved-views-toggle-default"
                    @click="toggleDefault(v)"
                  >{{ v.isDefault ? 'Clear default' : 'Set default' }}</button>
                  <button
                    type="button"
                    class="text-small text-status-error hover:underline"
                    data-testid="saved-views-delete"
                    @click="remove(v)"
                  >Delete</button>
                </div>
              </li>
            </ul>
          </BulwarkCard>
        </section>
      </template>

      <EmptyState
        v-if="nonEmptyGroups().length === 0"
        title="No saved views yet"
        body="Create a saved view from any admin list page by opening the Views menu."
      />
    </div>
  </div>
</template>

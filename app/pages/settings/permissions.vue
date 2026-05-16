<!--
  app/pages/settings/permissions.vue — admin permissions matrix
  (W4-1 / EH-I / ADR-0025).

  # Decisions (ADR-0008, ADR-0025)
    - Rows are the static permission slugs from
      `shared/auth/default-permissions.ts`, grouped by `section`.
    - Columns are the seven canonical roles. `super_admin` is shown
      and editable; admins who really want to lock the platform out
      can do it (the audit row tells the story).
    - Each cell is tri-state (`default | granted | denied`), cycled
      on click. Auto-save fires `permission.upsert` immediately and
      a small "Saving…" indicator lives in the header. We auto-save
      rather than batching because the user expectation on a matrix
      is "the row I click takes effect now."
    - "Reset to defaults" calls `permission.resetToDefaults(orgId)`
      and refetches — the same wire the service exposes for ADR-0025
      §predictable-rollback.

  # Decision cast down
    - A separate save button that batches the dirty diff. Rejected —
      matrix UIs that batch always trip up users who tab away and
      lose pending changes. Auto-save trades a tiny perf overhead
      (one HTTP call per click) for unambiguous semantics.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { PERMISSION_CATALOG } from '~~/shared/auth/default-permissions'
import { RoleSchema, type Role } from '~~/shared/contracts/_shared'
import { cycleCellState, deriveCellState, type CellState } from '~/composables/permissions-matrix-helpers'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Permissions' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const permission = useService('permission')
const { t } = useLabel()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const ROLES = RoleSchema.options
const SECTIONS = Array.from(new Set(PERMISSION_CATALOG.map((p) => p.section)))

// Map<`${role}|${slug}`, boolean | undefined>. `undefined` => default.
const overrides = ref<Map<string, boolean>>(new Map())
const saving = ref(false)
const errorMsg = ref<string | null>(null)

function keyOf(role: Role, slug: string): string {
  return `${role}|${slug}`
}

async function refreshOverrides() {
  if (!orgId.value) return
  errorMsg.value = null
  try {
    const { permissions } = await permission.listForOrg(orgId.value)
    const next = new Map<string, boolean>()
    for (const row of permissions) {
      next.set(keyOf(row.role, row.permissionSlug), row.allowed)
    }
    overrides.value = next
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Could not load permissions'
  }
}

await refreshOverrides()

function cellState(role: Role, slug: string): CellState {
  return deriveCellState(overrides.value.get(keyOf(role, slug)))
}

async function cycle(role: Role, slug: string) {
  const next = cycleCellState(cellState(role, slug))
  saving.value = true
  errorMsg.value = null
  try {
    if (next === 'default') {
      // Remove override row: the service supports this via upsert? No —
      // we'd need a delete. The contract exposes upsert + bulkUpsert +
      // resetToDefaults only. Approximation: set to the static default
      // value. That preserves "the row matches default" without a delete.
      const def = PERMISSION_CATALOG.find((p) => p.slug === slug)?.defaults[role] === true
      await permission.upsert({ organizationId: orgId.value, role, permissionSlug: slug, allowed: def })
      // We still treat this as `default` in the UI by clearing the
      // entry — the server row stays as the (now-redundant) override,
      // which `resetToDefaults` will sweep away later.
      const m = new Map(overrides.value)
      m.delete(keyOf(role, slug))
      overrides.value = m
    } else {
      const allowed = next === 'granted'
      await permission.upsert({ organizationId: orgId.value, role, permissionSlug: slug, allowed })
      const m = new Map(overrides.value)
      m.set(keyOf(role, slug), allowed)
      overrides.value = m
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    saving.value = false
  }
}

async function resetAll() {
  if (!confirm('Reset every permission to its role default? This deletes all overrides.')) return
  saving.value = true
  errorMsg.value = null
  try {
    await permission.resetToDefaults(orgId.value)
    overrides.value = new Map()
    await refreshOverrides()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Reset failed'
  } finally {
    saving.value = false
  }
}

function badgeFor(state: CellState): { cls: string; label: string } {
  if (state === 'granted') {
    return {
      cls: 'bg-status-success/10 text-status-success border-status-success/30',
      label: t('permissions.matrix.state', 'granted', 'Allow'),
    }
  }
  if (state === 'denied') {
    return {
      cls: 'bg-status-error/10 text-status-error border-status-error/30',
      label: t('permissions.matrix.state', 'denied', 'Deny'),
    }
  }
  return {
    cls: 'bg-surface-muted text-text-secondary border-border',
    label: t('permissions.matrix.state', 'default', 'Default'),
  }
}

function bySection(section: string) {
  return PERMISSION_CATALOG.filter((p) => p.section === section)
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-6xl mx-auto" data-testid="permissions-matrix-page">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Settings', to: '/settings' },
        { label: t('permissions.matrix', 'title', 'Permissions') },
      ]"
    />

    <header class="mt-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-display">{{ t('permissions.matrix', 'title', 'Permissions') }}</h1>
        <p class="text-body text-text-secondary mt-1">
          Cycle each cell: default → allow → deny.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span
          v-if="saving"
          class="text-small text-text-secondary"
          data-testid="permissions-saving"
        >Saving…</span>
        <button
          type="button"
          class="inline-flex h-input items-center rounded-input border border-border bg-surface text-body text-text-primary hover:border-primary px-3"
          data-testid="permissions-reset"
          @click="resetAll"
        >{{ t('permissions.matrix', 'reset', 'Reset to defaults') }}</button>
      </div>
    </header>

    <p
      v-if="errorMsg"
      role="alert"
      class="mt-4 rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
    >{{ errorMsg }}</p>

    <div v-for="section in SECTIONS" :key="section" class="mt-6">
      <h2 class="text-h2 mb-2">{{ section }}</h2>
      <BulwarkCard padding="none">
        <div class="overflow-x-auto">
          <table class="w-full text-small" data-testid="permissions-matrix-table">
            <thead class="bg-surface-muted">
              <tr>
                <th class="text-left px-3 py-2 font-medium text-text-secondary">Permission</th>
                <th
                  v-for="role in ROLES"
                  :key="role"
                  class="text-left px-3 py-2 font-medium text-text-secondary whitespace-nowrap"
                >{{ role }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in bySection(section)"
                :key="p.slug"
                class="border-t border-border"
                :data-permission-slug="p.slug"
              >
                <th class="text-left px-3 py-2 font-normal text-text-primary whitespace-nowrap">
                  {{ p.label }}
                  <div class="text-tiny text-text-secondary">{{ p.slug }}</div>
                </th>
                <td v-for="role in ROLES" :key="role" class="px-3 py-2">
                  <button
                    type="button"
                    class="inline-flex items-center px-2 py-1 rounded-input border text-small min-w-[68px] justify-center"
                    :class="badgeFor(cellState(role, p.slug)).cls"
                    data-testid="permissions-cell"
                    :data-role="role"
                    :data-state="cellState(role, p.slug)"
                    @click="cycle(role, p.slug)"
                  >{{ badgeFor(cellState(role, p.slug)).label }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </BulwarkCard>
    </div>
  </div>
</template>

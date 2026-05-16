<!--
  app/pages/settings/feature-flags.vue — feature flags (W2-4 / EH-H Part B).

  # Decisions (ADR-0021)
    - super_admin only. Toggling a flag persists an org override row;
      empty override falls back to the global default.
    - One row per known slug + anything the org has overridden.
    - Toggle is on/off (text="on"/"off") — values that aren't boolean
      surface as raw text and an "Edit value" button (not built v1).
-->
<script setup lang="ts">
import type { FeatureFlagMerged } from '~~/shared/contracts/feature-flag'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ['super_admin'],
})

useHead({ title: 'Feature flags' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const featureFlag = useService('featureFlag')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const rows = ref<FeatureFlagMerged[]>([])

async function load() {
  const r = await featureFlag.listForOrg(orgId.value)
  rows.value = r.rows
}
await load()

async function toggle(row: FeatureFlagMerged) {
  const next = row.value === 'on' ? 'off' : 'on'
  try {
    await featureFlag.set({
      organizationId: orgId.value,
      slug: row.slug,
      value: next,
      description: row.description,
      updatedByUserId: session.value?.userId ?? null,
    })
    toastSuccess('Flag updated', `${row.slug} is now ${next}.`)
    await load()
  } catch (err) {
    toastError('Could not update flag', (err as Error).message)
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-feature-flags">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Feature flags' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Feature flags</h1>
      <p class="text-body text-text-secondary mt-1">
        Per-tenant runtime toggles. Override the global default per flag.
      </p>
    </header>

    <BulwarkCard padding="none" class="mt-6">
      <ul class="divide-y divide-border-default">
        <li
          v-for="f in rows"
          :key="f.slug"
          class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2"
          data-testid="flag-row"
          :data-slug="f.slug"
        >
          <div class="md:col-span-8">
            <code class="text-body font-medium">{{ f.slug }}</code>
            <p class="text-small text-text-secondary mt-1">{{ f.description ?? '—' }}</p>
            <p v-if="f.hasOverride" class="text-tiny text-status-info mt-1">
              Overridden (default: {{ f.defaultValue ?? 'unset' }})
            </p>
          </div>
          <div class="md:col-span-4 md:text-right self-center">
            <button
              type="button"
              class="inline-flex items-center rounded-pill px-3 py-1 text-tiny font-medium border border-border-default hover:bg-surface-muted"
              :class="f.value === 'on'
                ? 'bg-status-success/10 text-status-success'
                : 'bg-surface-muted text-text-secondary'"
              data-testid="flag-toggle-button"
              @click="toggle(f)"
            >{{ f.value === 'on' ? 'On' : 'Off' }}</button>
          </div>
        </li>
      </ul>
    </BulwarkCard>
  </div>
</template>

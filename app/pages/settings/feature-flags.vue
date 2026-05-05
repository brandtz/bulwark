<!--
  app/pages/settings/feature-flags.vue — feature flags (E9 stub).

  # Decisions (ADR-0008)
    - super_admin only. v1 is a static read-only list of the
      current flag set; a real flags service ships in E11.

  # Decision cast down
    - Rejected: building a fake toggle. Toggles that don't change
      runtime behaviour are misleading.
-->
<script setup lang="ts">
definePageMeta({
  middleware: ['role'],
  requiredRoles: ['super_admin'],
})

useHead({ title: 'Feature flags' })

const flags = [
  { key: 'compliance.async-jobs', value: true, description: 'Use the async-job pipeline for compliance PDF generation.' },
  { key: 'invoices.overdue-derived', value: true, description: 'Compute the "overdue" view client-side (vs. persisted column).' },
  { key: 'field.offline-queue', value: false, description: 'Enable the field-side offline queue (placeholder until PWA work).' },
]
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-feature-flags">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Feature flags' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Feature flags</h1>
      <p class="text-body text-text-secondary mt-1">
        Per-tenant runtime toggles. Read-only until Epic E11.
      </p>
    </header>

    <BulwarkCard padding="none" class="mt-6">
      <ul class="divide-y divide-border-default">
        <li
          v-for="f in flags"
          :key="f.key"
          class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2"
          data-testid="flag-row"
        >
          <div class="md:col-span-8">
            <code class="text-body font-medium">{{ f.key }}</code>
            <p class="text-small text-text-secondary mt-1">{{ f.description }}</p>
          </div>
          <div class="md:col-span-4 md:text-right self-center">
            <span
              :class="[
                'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium',
                f.value ? 'bg-status-success/10 text-status-success' : 'bg-surface-muted text-text-secondary',
              ]"
            >{{ f.value ? 'On' : 'Off' }}</span>
          </div>
        </li>
      </ul>
    </BulwarkCard>
  </div>
</template>

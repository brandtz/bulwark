<!--
  app/pages/settings/catalog.vue — materials + labor catalog (E9-S5 stub).

  # Decisions (ADR-0008)
    - Stub for v1: surfaces the affordance under the Settings hub
      with a clear "lands in E11" banner. The mock services don't
      currently expose a catalog (line items are free-form on each
      quote), so faking saves would mislead the sponsor.

  # Decision cast down
    - Rejected: building a local-only catalog. The real value lands
      when quote line items can pick from saved entries — that needs
      a real backend.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Catalog' })
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-catalog">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Catalog' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Catalog</h1>
      <p class="text-body text-text-secondary mt-1">
        Re-usable materials and labor rate defaults for quote line items.
      </p>
    </header>

    <BulwarkCard padding="md" class="mt-6" data-testid="catalog-coming-soon">
      <p class="text-body font-medium">Lands in Epic E11</p>
      <p class="text-small text-text-secondary mt-1">
        The catalog needs a persistence layer so saved entries survive across
        sessions and team members. We'll wire it up with the real backend.
      </p>
    </BulwarkCard>
  </div>
</template>

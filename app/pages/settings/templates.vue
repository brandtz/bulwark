<!--
  app/pages/settings/templates.vue — document templates (E9-S6 stub).

  # Decisions (ADR-0008)
    - Stub for v1. Quote/compliance/invoice PDFs render from
      hardcoded templates today; per-tenant customisation lands
      with the real renderer in E11.

  # Decision cast down
    - Rejected: a textarea editor against a mock that does nothing
      visible. Better to surface the gap.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Document templates' })
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-templates">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Document templates' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Document templates</h1>
      <p class="text-body text-text-secondary mt-1">
        Customise the PDFs Bulwark generates for quotes, compliance reports,
        and invoices.
      </p>
    </header>

    <BulwarkCard padding="md" class="mt-6" data-testid="templates-coming-soon">
      <p class="text-body font-medium">Lands with the real renderer (Epic E11)</p>
      <p class="text-small text-text-secondary mt-1">
        Template editing requires the production PDF pipeline. Until then,
        Bulwark uses a single fixed template per document type.
      </p>
    </BulwarkCard>
  </div>
</template>

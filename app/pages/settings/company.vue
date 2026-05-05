<!--
  app/pages/settings/company.vue — company / organization profile (E9-S2).

  # Decisions (ADR-0008)
    - Read-only display in v1: shows the active org's name + the
      logged-in admin's role badge. Editable fields (CCB, branding,
      logo upload) defer to a real backend in E11.
    - Listed under Settings hub so the affordance is obvious; "Edit"
      surfaces a coming-soon banner instead of a 404.

  # Decision cast down
    - Rejected: building an org-name editor against the mock. The
      mock has no real persistence layer for org rows, and a fake
      save would mislead the sponsor.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Company' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const activeOrgName = computed(() => {
  const orgId = session.value?.activeOrganizationId
  return (
    session.value?.memberships.find((m) => m.organizationId === orgId)
      ?.organizationName ?? '—'
  )
})
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-company">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Company' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Company</h1>
      <p class="text-body text-text-secondary mt-1">
        Organization profile and branding.
      </p>
    </header>

    <BulwarkCard padding="md" class="mt-6" data-testid="company-summary">
      <dl class="flex flex-col gap-3 text-body">
        <div class="flex justify-between">
          <dt class="text-text-secondary">Organization</dt>
          <dd>{{ activeOrgName }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-text-secondary">Your role</dt>
          <dd>{{ session?.activeRole }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-text-secondary">Email</dt>
          <dd>{{ session?.email }}</dd>
        </div>
      </dl>
    </BulwarkCard>

    <BulwarkCard padding="md" class="mt-4" data-testid="company-coming-soon">
      <p class="text-body font-medium">Editable in a future release</p>
      <p class="text-small text-text-secondary mt-1">
        Logo upload, CCB number, and branding colors land when the real backend
        is wired (Epic E11).
      </p>
    </BulwarkCard>
  </div>
</template>

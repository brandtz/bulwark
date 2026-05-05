<!--
  app/pages/settings/index.vue — Settings hub (E9-S1).

  # Decisions (ADR-0008)
    - Per the sponsor's mandate, every configurable thing has a
      Settings sub-page. This hub is just a discovery surface: a card
      grid of links into each domain. No content lives here.
    - Role-gated to admin + super_admin only; the field/sub roles
      get nothing under `/settings`.
    - Card affordances are flat NuxtLinks (no fancy hover states) so
      the same hub renders well at 390px.

  # Decision cast down
    - Rejected: a sidebar within /settings. The site sidebar already
      has a Settings link; nesting another sidebar is the wrong UX.
      Cards + breadcrumbs work everywhere.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Settings' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

interface SettingsCard {
  to: string
  title: string
  body: string
  superAdminOnly?: boolean
}

const CARDS: SettingsCard[] = [
  { to: '/settings/company', title: 'Company', body: 'Org profile, GC license, and branding.' },
  { to: '/settings/users', title: 'Users & roles', body: 'Memberships and role assignments.' },
  { to: '/settings/standards', title: 'Compliance standards', body: 'Per-tenant overrides for the WUI evaluator.' },
  { to: '/settings/workflow', title: 'Workflow', body: 'Pipeline statuses and trade list.' },
  { to: '/settings/catalog', title: 'Catalog', body: 'Materials and labor rate defaults.' },
  { to: '/settings/templates', title: 'Document templates', body: 'Quote, compliance, and invoice PDFs.' },
  { to: '/settings/api-keys', title: 'API keys', body: 'Issue, view, and revoke programmatic credentials.' },
  { to: '/settings/audit-log', title: 'Audit log', body: 'Read-only history of writes across the org.' },
  { to: '/settings/feature-flags', title: 'Feature flags', body: 'Per-tenant toggles (super_admin only).', superAdminOnly: true },
]

const visibleCards = computed(() =>
  CARDS.filter((c) =>
    !c.superAdminOnly || session.value?.activeRole === 'super_admin',
  ),
)
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="settings-hub">
    <header>
      <h1 class="text-display">Settings</h1>
      <p class="text-body text-text-secondary mt-1">
        Configure every part of how your Bulwark org operates.
      </p>
    </header>

    <ul class="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <li v-for="card in visibleCards" :key="card.to" data-testid="settings-card">
        <NuxtLink :to="card.to" class="block">
          <BulwarkCard padding="md" clickable>
            <p class="text-body font-medium text-text-primary">{{ card.title }}</p>
            <p class="text-small text-text-secondary mt-1">{{ card.body }}</p>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

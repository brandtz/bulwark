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
import type { IconName } from '~/components/ui/icon-names'

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
  icon: string
  superAdminOnly?: boolean
}

// W2-6 / EH-L: each card gets a sprite glyph for visual scan speed.
// Names come from app/components/ui/icon-names.ts (unit-test enforced).
const CARDS: SettingsCard[] = [
  { to: '/settings/company', title: 'Company', body: 'Org profile, GC license, and branding.', icon: 'building' },
  { to: '/settings/branding', title: 'Branding', body: 'Logo, colors, footer text, and locale defaults.', icon: 'image' },
  { to: '/settings/labels', title: 'Labels', body: 'Override status names, trade names, and other user-facing copy.', icon: 'edit' },
  { to: '/settings/pipelines', title: 'Status pipelines', body: 'Editable status slugs and allowed transitions per entity.', icon: 'list' },
  { to: '/settings/trades', title: 'Trades', body: 'Tenant catalog of trades for WO scaffolding.', icon: 'wrench' },
  { to: '/settings/numbering-defaults', title: 'Numbering & defaults', body: 'Quote/WO/invoice number formats and SLA defaults.', icon: 'clipboard' },
  { to: '/settings/programs', title: 'Programs', body: 'Inspection & service programs.', icon: 'flame' },
  { to: '/settings/inspection-templates', title: 'Inspection templates', body: 'Author and edit the field-capture forms per program.', icon: 'file-text' },
  { to: '/settings/users', title: 'Users & roles', body: 'Memberships and role assignments.', icon: 'users' },
  { to: '/settings/standards', title: 'Compliance standards', body: 'Per-tenant overrides for the WUI evaluator.', icon: 'shield' },
  { to: '/settings/workflow', title: 'Workflow', body: 'Pipeline statuses and trade list.', icon: 'refresh' },
  { to: '/settings/catalog', title: 'Catalog', body: 'Materials and labor rate defaults.', icon: 'list' },
  { to: '/settings/templates', title: 'Document templates', body: 'Quote, compliance, and invoice PDFs.', icon: 'file' },
  { to: '/settings/api-keys', title: 'API keys', body: 'Issue, view, and revoke programmatic credentials.', icon: 'shield' },
  { to: '/settings/providers', title: 'Providers', body: 'Configure email, SMS, storage, and PDF providers.', icon: 'settings' },
  { to: '/settings/webhooks', title: 'Webhooks', body: 'Outbound HTTP subscriptions for org events.', icon: 'external-link' },
  { to: '/settings/audit-log', title: 'Audit log', body: 'Read-only history of writes across the org.', icon: 'eye' },
  { to: '/settings/saved-views', title: 'Saved views', body: 'Manage your private and shared list views.', icon: 'list' },
  { to: '/settings/permissions', title: 'Permissions', body: 'Per-role overrides for fine-grained capabilities.', icon: 'shield' },
  { to: '/settings/feature-flags', title: 'Feature flags', body: 'Per-tenant toggles (super_admin only).', icon: 'alert-triangle', superAdminOnly: true },
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
            <div class="flex items-start gap-3">
              <!-- W2-6 / EH-L: scan glyph from the sprite. -->
              <BulwarkIcon :name="(card.icon as IconName)" size="lg" class="mt-0.5 text-primary shrink-0" />
              <div class="min-w-0">
                <p class="text-body font-medium text-text-primary">{{ card.title }}</p>
                <p class="text-small text-text-secondary mt-1">{{ card.body }}</p>
              </div>
            </div>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

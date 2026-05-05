<!--
  app/pages/settings/workflow.vue — pipeline statuses + trade list (E9-S4).

  # Decisions (ADR-0008)
    - Read-only viewer in v1: lists the canonical pipeline statuses
      and trade options so admins can confirm what their team is
      using. Editing requires schema migration plumbing that lands
      in E11.

  # Decision cast down
    - Rejected: a custom "rename a status" UX. Status slugs are
      hardcoded in routing + filters; renaming would orphan deep
      links until the schema layer lands.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  PROPERTY_STATUS_LABEL,
  type PropertyStatus,
} from '~~/shared/contracts/property'
import { TRADE_LABEL, type Trade } from '~~/shared/contracts/subcontractor'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Workflow' })

const statuses = Object.entries(PROPERTY_STATUS_LABEL) as [PropertyStatus, string][]
const trades = Object.entries(TRADE_LABEL) as [Trade, string][]
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-workflow">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Workflow' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Workflow</h1>
      <p class="text-body text-text-secondary mt-1">
        Pipeline statuses and trade list used across the org.
      </p>
    </header>

    <section class="mt-6" data-testid="workflow-statuses">
      <h2 class="text-h2 mb-2">Pipeline statuses</h2>
      <BulwarkCard padding="none">
        <ul class="divide-y divide-border-default">
          <li
            v-for="[slug, label] in statuses"
            :key="slug"
            class="p-3 md:p-4 flex items-center justify-between"
            data-testid="workflow-status-row"
          >
            <span class="text-body">{{ label }}</span>
            <code class="text-small text-text-secondary">{{ slug }}</code>
          </li>
        </ul>
      </BulwarkCard>
    </section>

    <section class="mt-6" data-testid="workflow-trades">
      <h2 class="text-h2 mb-2">Trades</h2>
      <BulwarkCard padding="none">
        <ul class="divide-y divide-border-default">
          <li
            v-for="[slug, label] in trades"
            :key="slug"
            class="p-3 md:p-4 flex items-center justify-between"
            data-testid="workflow-trade-row"
          >
            <span class="text-body">{{ label }}</span>
            <code class="text-small text-text-secondary">{{ slug }}</code>
          </li>
        </ul>
      </BulwarkCard>
    </section>

    <BulwarkCard padding="md" class="mt-4" data-testid="workflow-coming-soon">
      <p class="text-body font-medium">Editable in Epic E11</p>
      <p class="text-small text-text-secondary mt-1">
        Renaming a status or adding a custom trade requires schema migrations
        that ship with the real backend.
      </p>
    </BulwarkCard>
  </div>
</template>

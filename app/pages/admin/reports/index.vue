<!--
  pages/admin/reports/index.vue — reports landing page (W3-2 / EH-K / ADR-0030).

  # Decisions (ADR-0008)
    - A simple link grid keyed by slug. Each slug maps to a `[slug].vue`
      report page that owns the date range + CSV export. Titles flow
      through `useLabel().t('reports.titles', slug, default)`.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})
useHead({ title: 'Reports' })

const labels = useLabel()

interface ReportLink { slug: string; description: string }
const reports: ReportLink[] = [
  { slug: 'revenue', description: 'Money received bucketed by month.' },
  { slug: 'subcontractor', description: 'Completed WOs, hours, revenue share, hours variance.' },
  { slug: 'inspection-pass', description: 'Pass / warn / fail counts per program.' },
  { slug: 'ar-aging', description: 'Outstanding balance bucketed 0-30/31-60/61-90/90+.' },
  { slug: 'top-properties', description: 'Properties ranked by revenue, WO count, or open issues.' },
]
</script>

<template>
  <div class="p-4 md:p-6" data-testid="admin-reports-landing">
    <h1 class="text-display">Reports</h1>
    <p class="text-body text-text-secondary mt-1 mb-6">
      Read-only roll-ups across quotes, invoices, payments, work orders, and inspections.
    </p>
    <ul class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <li v-for="r in reports" :key="r.slug">
        <NuxtLink
          :to="`/admin/reports/${r.slug}`"
          class="block"
          :data-testid="`report-link-${r.slug}`"
        >
          <BulwarkCard class="hover:border-primary transition-colors">
            <h2 class="text-heading">{{ labels.t('reports.titles', r.slug, r.slug) }}</h2>
            <p class="text-small text-text-secondary mt-1">{{ r.description }}</p>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

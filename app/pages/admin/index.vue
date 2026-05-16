<!--
  pages/admin/index.vue — admin landing dashboard (W3-2 / EH-K / ADR-0030).

  # Decisions (ADR-0008, ADR-0030)
    - Replaces the placeholder kanban-by-status that previously squatted at
      `/admin`. The kanban view still lives at `/admin/properties` (toggle).
    - Reads exclusively through `useService('reporting')` \u2014 no direct
      Drizzle, no cross-service joins in the page. The reporting service
      owns the aggregation.
    - Date range is a URL-less local state (the picker is a small set of
      preset buttons + custom). The "delta vs previous range" calls
      `dashboardKpis` a second time for the previous equivalent window;
      if the previous window's total is zero we hide the delta to avoid
      meaningless +Inf/-100% labels.
    - All status copy goes through `useLabel().t(...)` per ADR-0014.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { formatCents } from '~~/shared/utils/money'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Dashboard' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const reporting = useService('reporting')
const labels = useLabel()

type RangeKey = '7d' | '30d' | '90d' | 'ytd' | 'custom'
const rangeKey = ref<RangeKey>('30d')
const customFrom = ref<string>('')
const customTo = ref<string>('')

function isoDay(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

const currentRange = computed(() => {
  const now = new Date()
  const to = isoDay(now)
  if (rangeKey.value === 'custom' && customFrom.value && customTo.value) {
    return { from: new Date(customFrom.value).toISOString(), to: new Date(customTo.value).toISOString() }
  }
  if (rangeKey.value === 'ytd') {
    return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString(), to }
  }
  const days = rangeKey.value === '7d' ? 7 : rangeKey.value === '90d' ? 90 : 30
  const from = new Date(now.getTime() - days * 86_400_000)
  return { from: isoDay(from), to }
})

const previousRange = computed(() => {
  const r = currentRange.value
  const span = new Date(r.to).getTime() - new Date(r.from).getTime()
  return {
    from: new Date(new Date(r.from).getTime() - span).toISOString(),
    to: r.from,
  }
})

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: kpiData, refresh: refreshKpis } = await useAsyncData(
  'admin.dashboard.kpis',
  async () => {
    if (!orgId.value) return null
    const [current, previous] = await Promise.all([
      reporting.dashboardKpis({ organizationId: orgId.value, range: currentRange.value }),
      reporting.dashboardKpis({ organizationId: orgId.value, range: previousRange.value }),
    ])
    return { current, previous }
  },
  { watch: [currentRange] },
)

const { data: quotesByStatus } = await useAsyncData(
  'admin.dashboard.quotesByStatus',
  () => orgId.value
    ? reporting.quotesByStatus({ organizationId: orgId.value, range: currentRange.value })
    : Promise.resolve([]),
  { watch: [currentRange] },
)

const { data: wosByPriority } = await useAsyncData(
  'admin.dashboard.wosByPriority',
  () => orgId.value
    ? reporting.wosByPriority({ organizationId: orgId.value, range: currentRange.value })
    : Promise.resolve([]),
  { watch: [currentRange] },
)

const trendRange = computed(() => {
  const to = new Date()
  const from = new Date(to.getTime() - 90 * 86_400_000)
  return { from: isoDay(from), to: isoDay(to) }
})
const { data: revenueSeries } = await useAsyncData(
  'admin.dashboard.revenueTrend',
  () => orgId.value
    ? reporting.revenueTrend({ organizationId: orgId.value, granularity: 'day', range: trendRange.value })
    : Promise.resolve([]),
)

const { data: arAgingRows } = await useAsyncData(
  'admin.dashboard.arAging',
  () => orgId.value ? reporting.arAging({ organizationId: orgId.value }) : Promise.resolve([]),
)

const { data: topRevenue } = await useAsyncData(
  'admin.dashboard.topRevenue',
  () => orgId.value
    ? reporting.topProperties({ organizationId: orgId.value, range: trendRange.value, by: 'revenue', limit: 5 })
    : Promise.resolve([]),
)

const { data: openIssues } = await useAsyncData(
  'admin.dashboard.openIssues',
  () => orgId.value
    ? reporting.topProperties({ organizationId: orgId.value, range: currentRange.value, by: 'openIssues', limit: 10 })
    : Promise.resolve([]),
  { watch: [currentRange] },
)

function delta(curr: number, prev: number): { pct: number; show: boolean; positive: boolean } | null {
  if (!prev) return null
  const diff = curr - prev
  return {
    pct: Math.round((diff / prev) * 100),
    show: true,
    positive: diff >= 0,
  }
}

function fmtRange(key: RangeKey): string {
  return labels.t('dashboard.range', key, key)
}

const kpiCards = computed(() => {
  const c = kpiData.value?.current
  const p = kpiData.value?.previous
  if (!c) return []
  const money = (n: number) => formatCents(n)
  const items = [
    { key: 'open-quotes', value: c.openQuotesCount, prev: p?.openQuotesCount ?? 0, fmt: (n: number) => String(n) },
    { key: 'open-quotes-value', value: c.openQuotesValueCents, prev: p?.openQuotesValueCents ?? 0, fmt: money },
    { key: 'accepted-quotes-value', value: c.acceptedQuotesValueCents, prev: p?.acceptedQuotesValueCents ?? 0, fmt: money },
    { key: 'scheduled-wos', value: c.scheduledWosCount, prev: p?.scheduledWosCount ?? 0, fmt: (n: number) => String(n) },
    { key: 'overdue-invoices', value: c.overdueInvoicesCount, prev: p?.overdueInvoicesCount ?? 0, fmt: (n: number) => String(n) },
    { key: 'overdue-invoices-value', value: c.overdueInvoicesValueCents, prev: p?.overdueInvoicesValueCents ?? 0, fmt: money },
    { key: 'paid-this-month', value: c.paidThisMonthCents, prev: p?.paidThisMonthCents ?? 0, fmt: money },
    { key: 'compliance-this-month', value: c.complianceDocsThisMonth, prev: p?.complianceDocsThisMonth ?? 0, fmt: (n: number) => String(n) },
  ]
  return items.map((it) => ({
    ...it,
    label: labels.t('dashboard.kpis', it.key, it.key),
    delta: delta(it.value, it.prev),
  }))
})

const quoteDonut = computed(() =>
  (quotesByStatus.value ?? []).map((s) => ({
    label: labels.t('status.quote', s.status, s.status),
    value: s.count,
  })),
)

const woPriorityDonut = computed(() =>
  (wosByPriority.value ?? []).map((s) => ({
    label: labels.t('work-order.priority', s.status, s.status),
    value: s.count,
  })),
)

const arBars = computed(() =>
  (arAgingRows.value ?? []).map((r) => ({
    label: r.bucket,
    value: r.totalCents,
  })),
)

const sparkPoints = computed(() => (revenueSeries.value ?? []).map((p) => p.cents))
const emptyCopy = computed(() => labels.t('dashboard', 'empty', 'No data in this range yet.'))

void refreshKpis
</script>

<template>
  <div class="p-4 md:p-6" data-testid="admin-dashboard">
    <div class="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 class="text-display">Dashboard</h1>
        <p class="text-body text-text-secondary mt-1">
          Welcome back, {{ session?.fullName?.split(' ')[0] }}.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2" data-testid="dashboard-range-picker">
        <button
          v-for="key in (['7d','30d','90d','ytd','custom'] as const)"
          :key="key"
          type="button"
          :data-testid="`range-${key}`"
          :class="[
            'text-small px-3 py-1.5 rounded-md border',
            rangeKey === key
              ? 'bg-primary text-white border-primary'
              : 'bg-surface text-text-primary border-border hover:bg-surface-muted',
          ]"
          @click="rangeKey = key"
        >
          {{ fmtRange(key) }}
        </button>
        <template v-if="rangeKey === 'custom'">
          <input
            v-model="customFrom"
            type="date"
            class="text-small px-2 py-1.5 rounded-md border border-border bg-surface"
            data-testid="range-custom-from"
          >
          <input
            v-model="customTo"
            type="date"
            class="text-small px-2 py-1.5 rounded-md border border-border bg-surface"
            data-testid="range-custom-to"
          >
        </template>
      </div>
    </div>

    <!-- KPI cards: 2x4 grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="dashboard-kpi-grid">
      <BulwarkCard v-for="card in kpiCards" :key="card.key" :data-testid="`kpi-${card.key}`">
        <div class="flex flex-col">
          <span class="text-tiny text-text-secondary uppercase tracking-wide">{{ card.label }}</span>
          <span class="text-display mt-1">{{ card.fmt(card.value) }}</span>
          <span
            v-if="card.delta"
            class="text-tiny mt-1"
            :class="card.delta.positive ? 'text-success' : 'text-error'"
          >
            {{ card.delta.positive ? '+' : '' }}{{ card.delta.pct }}% vs previous
          </span>
        </div>
      </BulwarkCard>
    </div>

    <!-- Donut charts: quote status + WO priority -->
    <div class="grid gap-4 md:grid-cols-2 mt-6">
      <BulwarkCard data-testid="dashboard-quotes-by-status">
        <h2 class="text-heading mb-3">Quotes by status</h2>
        <ChartsDonut :data="quoteDonut" />
        <p v-if="quoteDonut.length === 0" class="text-small text-text-secondary">{{ emptyCopy }}</p>
      </BulwarkCard>
      <BulwarkCard data-testid="dashboard-wos-by-priority">
        <h2 class="text-heading mb-3">Work orders by priority</h2>
        <ChartsDonut :data="woPriorityDonut" />
        <p v-if="woPriorityDonut.length === 0" class="text-small text-text-secondary">{{ emptyCopy }}</p>
      </BulwarkCard>
    </div>

    <!-- Revenue trend sparkline -->
    <BulwarkCard class="mt-6" data-testid="dashboard-revenue-trend">
      <div class="flex items-baseline justify-between mb-3">
        <h2 class="text-heading">Revenue trend (90d)</h2>
        <span class="text-small text-text-secondary">{{ revenueSeries?.length ?? 0 }} points</span>
      </div>
      <ChartsSparkline :data="sparkPoints" :width="720" :height="100" />
      <p v-if="sparkPoints.length === 0" class="text-small text-text-secondary mt-2">{{ emptyCopy }}</p>
    </BulwarkCard>

    <!-- AR Aging bar chart -->
    <BulwarkCard class="mt-6" data-testid="dashboard-ar-aging">
      <h2 class="text-heading mb-3">AR aging</h2>
      <ChartsBar :data="arBars" :format-value="(n: number) => formatCents(n)" />
      <p v-if="arBars.length === 0" class="text-small text-text-secondary mt-2">{{ emptyCopy }}</p>
    </BulwarkCard>

    <!-- Top properties + open compliance issues -->
    <div class="grid gap-4 md:grid-cols-2 mt-6">
      <BulwarkCard data-testid="dashboard-top-revenue">
        <h2 class="text-heading mb-3">Top properties by revenue (90d)</h2>
        <ul v-if="(topRevenue ?? []).length > 0" class="space-y-2">
          <li
            v-for="row in topRevenue"
            :key="row.propertyId"
            class="flex items-center justify-between text-body"
            :data-testid="`top-revenue-row-${row.propertyId}`"
          >
            <NuxtLink :to="`/admin/properties/${row.propertyId}`" class="text-text-primary truncate hover:underline">
              {{ row.name }}
            </NuxtLink>
            <span class="text-text-secondary tabular-nums">{{ formatCents(row.value) }}</span>
          </li>
        </ul>
        <p v-else class="text-small text-text-secondary">{{ emptyCopy }}</p>
      </BulwarkCard>
      <BulwarkCard data-testid="dashboard-open-issues">
        <h2 class="text-heading mb-3">Open compliance issues</h2>
        <ul v-if="(openIssues ?? []).length > 0" class="space-y-2">
          <li
            v-for="row in openIssues"
            :key="row.propertyId"
            class="flex items-center justify-between text-body"
            :data-testid="`open-issue-row-${row.propertyId}`"
          >
            <NuxtLink :to="`/admin/properties/${row.propertyId}`" class="text-text-primary truncate hover:underline">
              {{ row.name }}
            </NuxtLink>
            <StatusBadge status="compliance_pending" />
          </li>
        </ul>
        <p v-else class="text-small text-text-secondary">{{ emptyCopy }}</p>
      </BulwarkCard>
    </div>
  </div>
</template>

<!--
  pages/admin/reports/[slug].vue — single report renderer (W3-2 / EH-K /
  ADR-0030).

  # Decisions (ADR-0008, ADR-0030)
    - One Vue file branching on `slug` to render five reports. Saves five
      near-identical files; the branch tax is trivial and easier to
      maintain in one place. Each branch declares its columns + row
      source + CSV column descriptors.
    - Date range picker + "Export CSV" button live in the page header.
      CSV export funnels through `useCsvExport()` so escaping is shared
      with the unit tests.
    - Status / priority / program copy through `useLabel().t(...)`.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { useCsvExport } from '~/composables/useCsvExport'
import { formatCents } from '~~/shared/utils/money'
import type { CsvColumn } from '~~/shared/utils/reporting'
import type {
  ArAgingRow,
  InspectionPassRateRow,
  MoneySeriesPoint,
  SubcontractorPerformanceRow,
  TopPropertyRow,
} from '~~/shared/contracts/reporting'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const labels = useLabel()
useHead({ title: () => `Report \u00b7 ${labels.t('reports.titles', slug.value, slug.value)}` })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const reporting = useService('reporting')
const csv = useCsvExport()

type RangeKey = '7d' | '30d' | '90d' | 'ytd' | 'custom'
const rangeKey = ref<RangeKey>('90d')
const customFrom = ref('')
const customTo = ref('')

function isoDay(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}
const range = computed(() => {
  const now = new Date()
  const to = isoDay(now)
  if (rangeKey.value === 'custom' && customFrom.value && customTo.value) {
    return { from: new Date(customFrom.value).toISOString(), to: new Date(customTo.value).toISOString() }
  }
  if (rangeKey.value === 'ytd') {
    return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString(), to }
  }
  const days = rangeKey.value === '7d' ? 7 : rangeKey.value === '30d' ? 30 : 90
  return { from: isoDay(new Date(now.getTime() - days * 86_400_000)), to }
})

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
type ReportRow =
  | MoneySeriesPoint
  | SubcontractorPerformanceRow
  | InspectionPassRateRow
  | ArAgingRow
  | TopPropertyRow

const { data: rows, refresh } = await useAsyncData<ReportRow[]>(
  () => `admin.report.${slug.value}.${rangeKey.value}.${range.value.from}.${range.value.to}`,
  async (): Promise<ReportRow[]> => {
    if (!orgId.value) return []
    switch (slug.value) {
      case 'revenue':
        return reporting.revenueTrend({
          organizationId: orgId.value,
          granularity: 'month',
          range: range.value,
        })
      case 'subcontractor':
        return reporting.subcontractorPerformance({
          organizationId: orgId.value,
          range: range.value,
        })
      case 'inspection-pass':
        return reporting.inspectionPassRate({
          organizationId: orgId.value,
          range: range.value,
        })
      case 'ar-aging':
        return reporting.arAging({ organizationId: orgId.value })
      case 'top-properties':
        return reporting.topProperties({
          organizationId: orgId.value,
          range: range.value,
          by: 'revenue',
          limit: 25,
        })
      default:
        return []
    }
  },
  { watch: [range, slug] },
)

interface TableColumn {
  header: string
  render: (row: ReportRow) => string
  rawValue: (row: ReportRow) => unknown
}

const tableConfig = computed<{ columns: TableColumn[]; csvColumns: CsvColumn<ReportRow>[] }>(() => {
  switch (slug.value) {
    case 'revenue':
      return {
        columns: [
          { header: 'Month', render: (r) => new Date((r as MoneySeriesPoint).date).toISOString().slice(0, 7), rawValue: (r) => (r as MoneySeriesPoint).date },
          { header: 'Revenue', render: (r) => formatCents((r as MoneySeriesPoint).cents), rawValue: (r) => (r as MoneySeriesPoint).cents },
        ],
        csvColumns: [
          { header: 'month', value: (r) => new Date((r as MoneySeriesPoint).date).toISOString().slice(0, 7) },
          { header: 'revenue_cents', value: (r) => (r as MoneySeriesPoint).cents },
        ],
      }
    case 'subcontractor':
      return {
        columns: [
          { header: 'Subcontractor', render: (r) => (r as SubcontractorPerformanceRow).name, rawValue: (r) => (r as SubcontractorPerformanceRow).name },
          { header: 'Completed WOs', render: (r) => String((r as SubcontractorPerformanceRow).completedWos), rawValue: (r) => (r as SubcontractorPerformanceRow).completedWos },
          { header: 'Hours', render: (r) => (r as SubcontractorPerformanceRow).totalHours.toFixed(1), rawValue: (r) => (r as SubcontractorPerformanceRow).totalHours },
          { header: 'Revenue', render: (r) => formatCents((r as SubcontractorPerformanceRow).totalRevenueCents), rawValue: (r) => (r as SubcontractorPerformanceRow).totalRevenueCents },
          { header: 'Variance (hrs)', render: (r) => (r as SubcontractorPerformanceRow).varianceHours.toFixed(1), rawValue: (r) => (r as SubcontractorPerformanceRow).varianceHours },
        ],
        csvColumns: [
          { header: 'subcontractor', value: (r) => (r as SubcontractorPerformanceRow).name },
          { header: 'completed_work_orders', value: (r) => (r as SubcontractorPerformanceRow).completedWos },
          { header: 'total_hours', value: (r) => (r as SubcontractorPerformanceRow).totalHours },
          { header: 'total_revenue_cents', value: (r) => (r as SubcontractorPerformanceRow).totalRevenueCents },
          { header: 'variance_hours', value: (r) => (r as SubcontractorPerformanceRow).varianceHours },
        ],
      }
    case 'inspection-pass':
      return {
        columns: [
          { header: 'Program', render: (r) => labels.t('program', (r as InspectionPassRateRow).programSlug, (r as InspectionPassRateRow).programSlug), rawValue: (r) => (r as InspectionPassRateRow).programSlug },
          { header: 'Total', render: (r) => String((r as InspectionPassRateRow).totalInspections), rawValue: (r) => (r as InspectionPassRateRow).totalInspections },
          { header: 'Pass', render: (r) => String((r as InspectionPassRateRow).passCount), rawValue: (r) => (r as InspectionPassRateRow).passCount },
          { header: 'Warn', render: (r) => String((r as InspectionPassRateRow).warnCount), rawValue: (r) => (r as InspectionPassRateRow).warnCount },
          { header: 'Fail', render: (r) => String((r as InspectionPassRateRow).failCount), rawValue: (r) => (r as InspectionPassRateRow).failCount },
        ],
        csvColumns: [
          { header: 'program_slug', value: (r) => (r as InspectionPassRateRow).programSlug },
          { header: 'total_inspections', value: (r) => (r as InspectionPassRateRow).totalInspections },
          { header: 'pass_count', value: (r) => (r as InspectionPassRateRow).passCount },
          { header: 'warn_count', value: (r) => (r as InspectionPassRateRow).warnCount },
          { header: 'fail_count', value: (r) => (r as InspectionPassRateRow).failCount },
        ],
      }
    case 'ar-aging':
      return {
        columns: [
          { header: 'Bucket', render: (r) => (r as ArAgingRow).bucket, rawValue: (r) => (r as ArAgingRow).bucket },
          { header: 'Count', render: (r) => String((r as ArAgingRow).count), rawValue: (r) => (r as ArAgingRow).count },
          { header: 'Balance', render: (r) => formatCents((r as ArAgingRow).totalCents), rawValue: (r) => (r as ArAgingRow).totalCents },
        ],
        csvColumns: [
          { header: 'bucket', value: (r) => (r as ArAgingRow).bucket },
          { header: 'count', value: (r) => (r as ArAgingRow).count },
          { header: 'balance_cents', value: (r) => (r as ArAgingRow).totalCents },
        ],
      }
    case 'top-properties':
      return {
        columns: [
          { header: 'Property', render: (r) => (r as TopPropertyRow).name, rawValue: (r) => (r as TopPropertyRow).name },
          { header: 'Revenue', render: (r) => formatCents((r as TopPropertyRow).value), rawValue: (r) => (r as TopPropertyRow).value },
        ],
        csvColumns: [
          { header: 'property_id', value: (r) => (r as TopPropertyRow).propertyId },
          { header: 'property_name', value: (r) => (r as TopPropertyRow).name },
          { header: 'revenue_cents', value: (r) => (r as TopPropertyRow).value },
        ],
      }
    default:
      return { columns: [], csvColumns: [] }
  }
})

function onExport() {
  if (!rows.value) return
  csv.download({
    rows: rows.value,
    columns: tableConfig.value.csvColumns,
    filename: `report-${slug.value}-${range.value.from.slice(0, 10)}-to-${range.value.to.slice(0, 10)}.csv`,
  })
}

function fmtRange(key: RangeKey): string {
  return labels.t('dashboard.range', key, key)
}

void refresh
</script>

<template>
  <div class="p-4 md:p-6" :data-testid="`admin-report-${slug}`">
    <div class="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 class="text-display">{{ labels.t('reports.titles', slug, slug) }}</h1>
        <p class="text-body text-text-secondary mt-1">
          Range {{ range.from.slice(0, 10) }} &rarr; {{ range.to.slice(0, 10) }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="key in (['7d','30d','90d','ytd','custom'] as const)"
          :key="key"
          type="button"
          :data-testid="`report-range-${key}`"
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
            data-testid="report-range-custom-from"
          >
          <input
            v-model="customTo"
            type="date"
            class="text-small px-2 py-1.5 rounded-md border border-border bg-surface"
            data-testid="report-range-custom-to"
          >
        </template>
        <BulwarkButton
          size="md"
          data-testid="report-export-csv"
          @click="onExport"
        >
          Export CSV
        </BulwarkButton>
      </div>
    </div>

    <BulwarkCard>
      <table v-if="(rows ?? []).length > 0" class="w-full text-small" data-testid="report-table">
        <thead>
          <tr class="text-left border-b border-border">
            <th
              v-for="(col, i) in tableConfig.columns"
              :key="i"
              class="py-2 pr-3 text-tiny uppercase tracking-wide text-text-secondary"
            >
              {{ col.header }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in rows"
            :key="i"
            class="border-b border-border last:border-b-0"
            :data-testid="`report-row-${i}`"
          >
            <td
              v-for="(col, j) in tableConfig.columns"
              :key="j"
              class="py-2 pr-3 text-text-primary tabular-nums"
            >
              {{ col.render(row) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-small text-text-secondary" data-testid="report-empty">
        {{ labels.t('dashboard', 'empty', 'No data in this range yet.') }}
      </p>
    </BulwarkCard>
  </div>
</template>

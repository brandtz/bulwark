/**
 * shared/contracts/reporting.ts — Reporting + dashboards (W3-2 / EH-K).
 *
 * # What this contract owns (ADR-0030)
 *   - The read-only aggregate surface for the admin dashboard and the
 *     reports landing page. KPI cards, chart series, AR aging buckets,
 *     top-property lists, subcontractor performance, inspection pass
 *     rates. Everything money-shaped is integer cents.
 *   - There are NO mutate methods on this service. The dashboard reads
 *     across many existing services; making it a separate read service
 *     keeps the firewall + caching story simple and lets the real
 *     implementation use raw SQL aggregates without dragging audit
 *     plumbing around. ADR-0030 captures the rationale.
 *
 * # Decisions (ADR-0008, ADR-0030)
 *   - **DateRange semantics**: `from`/`to` are ISO strings, half-open
 *     `[from, to)`. The mock + real implementations enforce this so
 *     month-boundary buckets don't double-count.
 *   - **Granularity union for trends**: `day | week | month`. The real
 *     impl uses Postgres `date_trunc`; the mock buckets in JS with the
 *     same boundary rule.
 *   - **`CountByStatus` is reused for two shapes**: quote status and
 *     work-order priority both fit `{ status, count }[]`. The "status"
 *     field carries a priority string in the wos-by-priority response —
 *     the field name stays because every chart component already binds
 *     to `.status`.
 *   - **Top-properties `by` enum**: `revenue | workOrders | openIssues`.
 *     Each picks a different aggregate; the response shape is uniform
 *     `{ propertyId, name, value }` so a single list component renders
 *     all three. `value` is integer (cents for revenue, count for the
 *     others) — the page knows which is which from the `by` argument.
 *   - **Pass-rate semantics**: an inspection counts as `pass` when
 *     `status === 'signed'`, `warn` when `submitted` (filled but not
 *     yet signed), and `fail` when `superseded`. Drafts are excluded
 *     from the denominator. The evaluator-issue severity wiring is
 *     out of scope for v1; the status proxy is enough to show a
 *     program-by-program trend and unblocks downstream "improve our
 *     inspection completion" workflows.
 *
 * # Decisions cast down
 *   - Rejected: returning preformatted display strings ("$1,234.56").
 *     The contract stays in cents; the UI formats. Reports stay
 *     reusable from CSV export (which also stays cents-aware).
 *   - Rejected: pagination on top-N lists. Top lists are by definition
 *     small; the `limit` arg caps them.
 *   - Rejected: caching at this layer. The dashboard re-runs the
 *     queries on date-range changes; a memoize across requests would
 *     leak stale rollups after a payment is recorded. Phase 2 layers
 *     a per-request memoize once we have a request-scoped cache key.
 */
import { z } from 'zod'
import { MoneyCentsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Date range (half-open).
// ----------------------------------------------------------------------------
export const DateRangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
})
export type DateRange = z.infer<typeof DateRangeSchema>

export const TrendGranularitySchema = z.enum(['day', 'week', 'month'])
export type TrendGranularity = z.infer<typeof TrendGranularitySchema>

// ----------------------------------------------------------------------------
// Money + count series shapes.
// ----------------------------------------------------------------------------
export const MoneySeriesPointSchema = z.object({
  date: z.string().datetime(),
  cents: z.number().int(),
})
export type MoneySeriesPoint = z.infer<typeof MoneySeriesPointSchema>
export type MoneySeries = MoneySeriesPoint[]

export const CountByStatusItemSchema = z.object({
  status: z.string(),
  count: z.number().int().nonnegative(),
})
export type CountByStatusItem = z.infer<typeof CountByStatusItemSchema>
export type CountByStatus = CountByStatusItem[]

// ----------------------------------------------------------------------------
// AR aging bucket — fixed buckets per the contract.
// ----------------------------------------------------------------------------
export const ArAgingBucketSchema = z.enum(['0-30', '31-60', '61-90', '90+'])
export type ArAgingBucket = z.infer<typeof ArAgingBucketSchema>

export const ArAgingRowSchema = z.object({
  bucket: ArAgingBucketSchema,
  count: z.number().int().nonnegative(),
  totalCents: MoneyCentsSchema,
})
export type ArAgingRow = z.infer<typeof ArAgingRowSchema>

// ----------------------------------------------------------------------------
// Dashboard KPI bundle.
// ----------------------------------------------------------------------------
export const DashboardKpisSchema = z.object({
  openQuotesCount: z.number().int().nonnegative(),
  openQuotesValueCents: MoneyCentsSchema,
  acceptedQuotesValueCents: MoneyCentsSchema,
  scheduledWosCount: z.number().int().nonnegative(),
  overdueInvoicesCount: z.number().int().nonnegative(),
  overdueInvoicesValueCents: MoneyCentsSchema,
  paidThisMonthCents: MoneyCentsSchema,
  complianceDocsThisMonth: z.number().int().nonnegative(),
  openComplianceIssues: z.number().int().nonnegative(),
})
export type DashboardKpis = z.infer<typeof DashboardKpisSchema>

// ----------------------------------------------------------------------------
// Top properties.
// ----------------------------------------------------------------------------
export const TopPropertiesBySchema = z.enum(['revenue', 'workOrders', 'openIssues'])
export type TopPropertiesBy = z.infer<typeof TopPropertiesBySchema>

export const TopPropertyRowSchema = z.object({
  propertyId: UuidSchema,
  name: z.string(),
  value: z.number().int().nonnegative(),
})
export type TopPropertyRow = z.infer<typeof TopPropertyRowSchema>

// ----------------------------------------------------------------------------
// Subcontractor performance.
// ----------------------------------------------------------------------------
export const SubcontractorPerformanceRowSchema = z.object({
  subcontractorId: UuidSchema,
  name: z.string(),
  completedWos: z.number().int().nonnegative(),
  totalHours: z.number().nonnegative(),
  totalRevenueCents: MoneyCentsSchema,
  varianceHours: z.number(),
})
export type SubcontractorPerformanceRow = z.infer<typeof SubcontractorPerformanceRowSchema>

// ----------------------------------------------------------------------------
// Inspection pass-rate.
// ----------------------------------------------------------------------------
export const InspectionPassRateRowSchema = z.object({
  programSlug: z.string(),
  totalInspections: z.number().int().nonnegative(),
  passCount: z.number().int().nonnegative(),
  warnCount: z.number().int().nonnegative(),
  failCount: z.number().int().nonnegative(),
})
export type InspectionPassRateRow = z.infer<typeof InspectionPassRateRowSchema>

// ----------------------------------------------------------------------------
// Input envelopes.
// ----------------------------------------------------------------------------
export interface DashboardKpisInput {
  organizationId: string
  range: DateRange
}
export interface QuotesByStatusInput {
  organizationId: string
  range: DateRange
}
export interface WosByPriorityInput {
  organizationId: string
  range: DateRange
}
export interface ArAgingInput {
  organizationId: string
  asOf?: string
}
export interface RevenueTrendInput {
  organizationId: string
  granularity: TrendGranularity
  range: DateRange
}
export interface TopPropertiesInput {
  organizationId: string
  range: DateRange
  by: TopPropertiesBy
  limit: number
}
export interface SubcontractorPerformanceInput {
  organizationId: string
  range: DateRange
}
export interface InspectionPassRateInput {
  organizationId: string
  range: DateRange
}

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IReportingService {
  dashboardKpis(input: DashboardKpisInput): Promise<DashboardKpis>
  quotesByStatus(input: QuotesByStatusInput): Promise<CountByStatus>
  /** Returns CountByStatus where `status` carries the priority value. */
  wosByPriority(input: WosByPriorityInput): Promise<CountByStatus>
  arAging(input: ArAgingInput): Promise<ArAgingRow[]>
  revenueTrend(input: RevenueTrendInput): Promise<MoneySeries>
  topProperties(input: TopPropertiesInput): Promise<TopPropertyRow[]>
  subcontractorPerformance(
    input: SubcontractorPerformanceInput,
  ): Promise<SubcontractorPerformanceRow[]>
  inspectionPassRate(
    input: InspectionPassRateInput,
  ): Promise<InspectionPassRateRow[]>
}

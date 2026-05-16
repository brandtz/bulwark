/**
 * shared/mocks/reporting.mock.ts — read-only aggregator over the existing
 * mock services (W3-2 / EH-K / ADR-0030).
 *
 * # What this file owns
 *   - `MockReportingService`: takes references to the sibling mock services
 *     it needs to read (quote, invoice, invoicePayment, workOrder, property,
 *     subcontractor, inspection, complianceDoc, program) and aggregates from
 *     their `list()` methods. No persistence — the reporting view is a
 *     pure projection of the underlying mocks.
 *   - The constructor accepts a `Deps` bag (not a `BulwarkServices` instance)
 *     because the factory builds services in two passes; passing only the
 *     subset we read keeps the dependency graph explicit.
 *
 * # Decisions (ADR-0008, ADR-0030)
 *   - **Read-only**: no events emitted, no audit writes. Mirrors the
 *     real service.
 *   - **Tenant firewall**: every method calls `assertSameTenant` before
 *     any sibling read, even though sibling reads also enforce the
 *     firewall — defense in depth and a clearer audit log on this
 *     surface.
 *   - **Range semantics**: half-open `[from, to)`. JS-side filters use
 *     `row.createdAt >= from && row.createdAt < to` (ISO strings
 *     compare lexicographically because they're zero-padded to the
 *     millisecond).
 *   - **Pass-rate proxy**: status === 'signed' → pass; 'submitted' →
 *     warn; 'superseded' → fail; 'draft' is excluded from the
 *     denominator. Same rule the contract documents.
 *
 * # Decisions cast down
 *   - Rejected: ad-hoc caching. Each call walks the mock arrays once;
 *     dashboard pages don't refire frequently and the lists cap at
 *     200 rows in practice.
 *   - Rejected: a separate "summary" cache attached to the invoice
 *     mock. That couples a reporting concern to the invoice service —
 *     it's exactly the leak ADR-0030 calls out as the reason to keep
 *     reporting a separate read service.
 */
import type {
  IReportingService,
  ArAgingInput,
  ArAgingRow,
  CountByStatus,
  DashboardKpis,
  DashboardKpisInput,
  InspectionPassRateInput,
  InspectionPassRateRow,
  MoneySeries,
  QuotesByStatusInput,
  RevenueTrendInput,
  SubcontractorPerformanceInput,
  SubcontractorPerformanceRow,
  TopPropertiesInput,
  TopPropertyRow,
  WosByPriorityInput,
} from '../contracts/reporting'
import type { IQuoteService } from '../contracts/quote'
import type { IInvoiceService } from '../contracts/invoice'
import type { IInvoicePaymentService } from '../contracts/invoice-payment'
import type { IWorkOrderService } from '../contracts/work-order'
import type { IPropertyService } from '../contracts/property'
import type { ISubcontractorService } from '../contracts/subcontractor'
import type { IInspectionService } from '../contracts/inspection'
import type { IComplianceDocService } from '../contracts/compliance'
import type { IProgramService } from '../contracts/program'
import { aggregateArAging, type ArAgingInputRow } from '../utils/reporting'
import { assertSameTenant, type TenantResolver } from './tenant'

export interface MockReportingDeps {
  quote: IQuoteService
  invoice: IInvoiceService
  invoicePayment: IInvoicePaymentService
  workOrder: IWorkOrderService
  property: IPropertyService
  subcontractor: ISubcontractorService
  inspection: IInspectionService
  complianceDoc: IComplianceDocService
  program: IProgramService
}

const LARGE_PAGE = 200

function inRange(iso: string | null, from: string, to: string): boolean {
  if (!iso) return false
  return iso >= from && iso < to
}

function startOfMonthIso(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return d.toISOString()
}

function bucketDateForGranularity(iso: string, granularity: 'day' | 'week' | 'month'): string {
  const d = new Date(iso)
  if (granularity === 'day') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
  }
  if (granularity === 'month') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
  }
  // week — Monday-anchored UTC.
  const day = d.getUTCDay() // 0 = Sun
  const diff = (day === 0 ? 6 : day - 1)
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
  return monday.toISOString()
}

export class MockReportingService implements IReportingService {
  constructor(
    private readonly deps: MockReportingDeps,
    private readonly tenantResolver?: TenantResolver,
  ) {}

  async dashboardKpis(input: DashboardKpisInput): Promise<DashboardKpis> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const { from, to } = input.range
    const orgId = input.organizationId

    const [quotes, invoices, workOrders, complianceDocs, payments, properties] =
      await Promise.all([
        this.deps.quote.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
        this.deps.invoice.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
        this.deps.workOrder.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
        this.deps.complianceDoc.list({ organizationId: orgId }),
        this.deps.invoicePayment.list({
          organizationId: orgId,
          page: 1,
          pageSize: LARGE_PAGE,
        }),
        this.deps.property.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
      ])

    const inRangeQuotes = quotes.rows.filter((q) => inRange(q.createdAt, from, to))
    const openQuotes = inRangeQuotes.filter((q) => q.status === 'draft' || q.status === 'sent')
    const acceptedQuotes = inRangeQuotes.filter((q) => q.status === 'accepted')

    const inRangeWos = workOrders.rows.filter((w) => inRange(w.createdAt, from, to))
    const scheduledWos = inRangeWos.filter((w) => w.status === 'scheduled').length

    const nowIso = new Date().toISOString()
    const overdueInvoices = invoices.rows.filter(
      (inv) =>
        inv.status === 'sent' &&
        inv.paidAt === null &&
        inv.dueAt !== null &&
        inv.dueAt < nowIso,
    )

    const monthStart = startOfMonthIso()
    const paidThisMonthCents = payments.rows
      .filter((p) => p.receivedAt >= monthStart)
      .reduce((sum, p) => sum + p.amountCents, 0)

    const complianceDocsThisMonth = complianceDocs.filter(
      (c) => c.createdAt >= monthStart && c.status === 'ready',
    ).length
    const openComplianceIssues = properties.rows.filter(
      (p) => p.status === 'compliance_pending',
    ).length

    return {
      openQuotesCount: openQuotes.length,
      openQuotesValueCents: openQuotes.reduce((s, q) => s + q.totals.totalCents, 0),
      acceptedQuotesValueCents: acceptedQuotes.reduce(
        (s, q) => s + q.totals.totalCents,
        0,
      ),
      scheduledWosCount: scheduledWos,
      overdueInvoicesCount: overdueInvoices.length,
      overdueInvoicesValueCents: overdueInvoices.reduce(
        (s, inv) =>
          s + Math.max(0, inv.totals.totalCents - (inv.paidAmountCents ?? 0)),
        0,
      ),
      paidThisMonthCents: Math.max(0, paidThisMonthCents),
      complianceDocsThisMonth,
      openComplianceIssues,
    }
  }

  async quotesByStatus(input: QuotesByStatusInput): Promise<CountByStatus> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const quotes = await this.deps.quote.list({
      organizationId: input.organizationId,
      page: 1,
      pageSize: LARGE_PAGE,
    })
    const tally = new Map<string, number>()
    for (const q of quotes.rows) {
      if (!inRange(q.createdAt, input.range.from, input.range.to)) continue
      tally.set(q.status, (tally.get(q.status) ?? 0) + 1)
    }
    return Array.from(tally.entries()).map(([status, count]) => ({ status, count }))
  }

  async wosByPriority(input: WosByPriorityInput): Promise<CountByStatus> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const wos = await this.deps.workOrder.list({
      organizationId: input.organizationId,
      page: 1,
      pageSize: LARGE_PAGE,
    })
    const tally = new Map<string, number>()
    for (const w of wos.rows) {
      if (!inRange(w.createdAt, input.range.from, input.range.to)) continue
      const p = w.priority ?? 'normal'
      tally.set(p, (tally.get(p) ?? 0) + 1)
    }
    return Array.from(tally.entries()).map(([status, count]) => ({ status, count }))
  }

  async arAging(input: ArAgingInput): Promise<ArAgingRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const asOf = input.asOf ?? new Date().toISOString()
    const asOfMs = new Date(asOf).getTime()
    const invoices = await this.deps.invoice.list({
      organizationId: input.organizationId,
      page: 1,
      pageSize: LARGE_PAGE,
    })
    const rows: ArAgingInputRow[] = []
    for (const inv of invoices.rows) {
      if (inv.status === 'paid' || inv.status === 'voided') continue
      const balance = inv.totals.totalCents - (inv.paidAmountCents ?? 0)
      if (balance <= 0) continue
      const anchor = inv.dueAt ?? inv.sentAt ?? inv.issuedAt ?? inv.createdAt
      const daysOpen = Math.floor((asOfMs - new Date(anchor).getTime()) / 86_400_000)
      rows.push({ daysOpen, balanceCents: balance })
    }
    return aggregateArAging(rows)
  }

  async revenueTrend(input: RevenueTrendInput): Promise<MoneySeries> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const payments = await this.deps.invoicePayment.list({
      organizationId: input.organizationId,
      page: 1,
      pageSize: LARGE_PAGE,
    })
    const buckets = new Map<string, number>()
    for (const p of payments.rows) {
      if (!inRange(p.receivedAt, input.range.from, input.range.to)) continue
      const key = bucketDateForGranularity(p.receivedAt, input.granularity)
      buckets.set(key, (buckets.get(key) ?? 0) + p.amountCents)
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, cents]) => ({ date, cents }))
  }

  async topProperties(input: TopPropertiesInput): Promise<TopPropertyRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const orgId = input.organizationId
    const properties = await this.deps.property.list({
      organizationId: orgId,
      page: 1,
      pageSize: LARGE_PAGE,
    })
    const propertyName = new Map<string, string>(
      properties.rows.map((p) => [p.id, p.addressLine1]),
    )

    if (input.by === 'revenue') {
      const [invoices, payments] = await Promise.all([
        this.deps.invoice.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
        this.deps.invoicePayment.list({
          organizationId: orgId,
          page: 1,
          pageSize: LARGE_PAGE,
        }),
      ])
      const invoiceProperty = new Map<string, string>(
        invoices.rows.map((i) => [i.id, i.propertyId]),
      )
      const tally = new Map<string, number>()
      for (const p of payments.rows) {
        if (!inRange(p.receivedAt, input.range.from, input.range.to)) continue
        const propId = invoiceProperty.get(p.invoiceId)
        if (!propId) continue
        tally.set(propId, (tally.get(propId) ?? 0) + p.amountCents)
      }
      return collectTop(tally, propertyName, input.limit)
    }

    if (input.by === 'workOrders') {
      const wos = await this.deps.workOrder.list({
        organizationId: orgId,
        page: 1,
        pageSize: LARGE_PAGE,
      })
      const tally = new Map<string, number>()
      for (const w of wos.rows) {
        if (!inRange(w.createdAt, input.range.from, input.range.to)) continue
        tally.set(w.propertyId, (tally.get(w.propertyId) ?? 0) + 1)
      }
      return collectTop(tally, propertyName, input.limit)
    }

    // openIssues — properties whose status is compliance_pending.
    const tally = new Map<string, number>()
    for (const p of properties.rows) {
      if (p.status === 'compliance_pending') {
        tally.set(p.id, (tally.get(p.id) ?? 0) + 1)
      }
    }
    return collectTop(tally, propertyName, input.limit)
  }

  async subcontractorPerformance(
    input: SubcontractorPerformanceInput,
  ): Promise<SubcontractorPerformanceRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const orgId = input.organizationId
    const [wos, subs, invoices] = await Promise.all([
      this.deps.workOrder.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
      this.deps.subcontractor.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
      this.deps.invoice.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
    ])
    const woRevenue = new Map<string, number>()
    for (const inv of invoices.rows) {
      if (inv.workOrderId) {
        woRevenue.set(
          inv.workOrderId,
          (woRevenue.get(inv.workOrderId) ?? 0) + inv.totals.totalCents,
        )
      }
    }
    type Agg = {
      completedWos: number
      totalHours: number
      estHours: number
      totalRevenueCents: number
      woIds: Set<string>
    }
    const acc = new Map<string, Agg>()
    for (const w of wos.rows) {
      if (!inRange(w.createdAt, input.range.from, input.range.to)) continue
      const completedSlots = w.tradeSlots.filter((s) => s.status === 'completed')
      if (completedSlots.length === 0) continue
      const woRev = woRevenue.get(w.id) ?? 0
      const subShare = woRev / completedSlots.length
      for (const slot of completedSlots) {
        if (!slot.assignedSubcontractorId) continue
        const a = acc.get(slot.assignedSubcontractorId) ?? {
          completedWos: 0,
          totalHours: 0,
          estHours: 0,
          totalRevenueCents: 0,
          woIds: new Set<string>(),
        }
        a.totalHours += slot.actualHours ?? 0
        a.estHours += slot.estimatedHours ?? 0
        a.totalRevenueCents += subShare
        a.woIds.add(w.id)
        acc.set(slot.assignedSubcontractorId, a)
      }
    }
    const out: SubcontractorPerformanceRow[] = []
    for (const sub of subs.rows) {
      const a = acc.get(sub.id)
      if (!a) continue
      out.push({
        subcontractorId: sub.id,
        name: sub.companyName,
        completedWos: a.woIds.size,
        totalHours: a.totalHours,
        totalRevenueCents: Math.round(a.totalRevenueCents),
        varianceHours: a.totalHours - a.estHours,
      })
    }
    out.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
    return out
  }

  async inspectionPassRate(
    input: InspectionPassRateInput,
  ): Promise<InspectionPassRateRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const orgId = input.organizationId
    const [inspections, programs] = await Promise.all([
      this.deps.inspection.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
      this.deps.program.list({ organizationId: orgId, page: 1, pageSize: LARGE_PAGE }),
    ])
    const programSlug = new Map<string, string>(programs.rows.map((p) => [p.id, p.slug]))
    type Agg = { pass: number; warn: number; fail: number; total: number }
    const acc = new Map<string, Agg>()
    for (const insp of inspections.rows) {
      if (!inRange(insp.createdAt, input.range.from, input.range.to)) continue
      if (insp.status === 'draft') continue
      const slug = insp.programId ? programSlug.get(insp.programId) ?? 'unassigned' : 'unassigned'
      const a = acc.get(slug) ?? { pass: 0, warn: 0, fail: 0, total: 0 }
      a.total += 1
      if (insp.status === 'signed') a.pass += 1
      else if (insp.status === 'submitted') a.warn += 1
      else if (insp.status === 'superseded') a.fail += 1
      acc.set(slug, a)
    }
    return Array.from(acc.entries()).map(([slug, a]) => ({
      programSlug: slug,
      totalInspections: a.total,
      passCount: a.pass,
      warnCount: a.warn,
      failCount: a.fail,
    }))
  }
}

function collectTop(
  tally: Map<string, number>,
  nameMap: Map<string, string>,
  limit: number,
): TopPropertyRow[] {
  return Array.from(tally.entries())
    .map(([propertyId, value]) => ({
      propertyId,
      name: nameMap.get(propertyId) ?? propertyId,
      value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(0, limit))
}

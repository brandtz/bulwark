/**
 * server/services/reporting.real.ts — Drizzle aggregator for the admin
 * dashboard + reports surface (W3-2 / EH-K / ADR-0030).
 *
 * # What this file owns
 *   - Direct SQL aggregates against `quotes`, `invoices`,
 *     `invoice_payments`, `work_orders`, `properties`, `subcontractors`,
 *     `inspections`, `compliance_docs`, `programs` to answer the eight
 *     contract methods.
 *   - Tenant firewall (`assertSameTenant`) at the top of every method.
 *     No `withAudit` — these are read-only views (ADR-0030).
 *
 * # Decisions (ADR-0008, ADR-0030)
 *   - **One aggregate query per method**: each method maps to a single
 *     SQL roll-up. We avoid round-tripping list endpoints because the
 *     real dataset will dwarf the mock cap of 200 rows.
 *   - **`date_trunc` for buckets**: the revenue trend uses Postgres'
 *     `date_trunc(:granularity, received_at)` to bucket payments. We
 *     parameterize the truncation level via a literal switch rather
 *     than interpolating user input.
 *   - **AR aging is computed in SQL**: a CASE expression buckets each
 *     unpaid invoice's days-open and we sum balances inside the same
 *     query.
 *   - **Pass-rate proxy** matches the contract: signed → pass,
 *     submitted → warn, superseded → fail, draft is excluded.
 *
 * # Decisions cast down
 *   - Rejected: materialized views. The numbers Drew sees on the
 *     dashboard must reflect the last payment recorded; a materialized
 *     view forces a refresh hook on every mutation across five services.
 *     The aggregates are cheap at our scale (≤10k rows per org).
 *   - Rejected: opening a transaction. Read-only multi-statement queries
 *     don't need it — Postgres MVCC snapshots are per-statement
 *     consistent and the dashboard tolerates a tiny window of drift.
 */
import { and, count, desc, eq, gte, lt, sql, sum } from 'drizzle-orm'
import type {
  ArAgingInput,
  ArAgingRow,
  CountByStatus,
  DashboardKpis,
  DashboardKpisInput,
  InspectionPassRateInput,
  InspectionPassRateRow,
  IReportingService,
  MoneySeries,
  QuotesByStatusInput,
  RevenueTrendInput,
  SubcontractorPerformanceInput,
  SubcontractorPerformanceRow,
  TopPropertiesInput,
  TopPropertyRow,
  TrendGranularity,
  WosByPriorityInput,
} from '../../shared/contracts/reporting'
import { getDb } from '../db/client'
import { quotes } from '../db/schema/quotes'
import { invoices } from '../db/schema/invoices'
import { invoicePayments } from '../db/schema/invoice_payments'
import { workOrders } from '../db/schema/work_orders'
import { properties } from '../db/schema/properties'
import { subcontractors } from '../db/schema/subcontractors'
import { inspections } from '../db/schema/inspections'
import { complianceDocs } from '../db/schema/compliance_docs'
import { programs } from '../db/schema/programs'
import { assertSameTenant, type TenantResolver } from './_tenant'

const AR_BUCKET_CASE = sql`
  CASE
    WHEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(${invoices.dueAt}, ${invoices.sentAt}, ${invoices.issuedAt}, ${invoices.createdAt}))) / 86400) <= 30 THEN '0-30'
    WHEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(${invoices.dueAt}, ${invoices.sentAt}, ${invoices.issuedAt}, ${invoices.createdAt}))) / 86400) <= 60 THEN '31-60'
    WHEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(${invoices.dueAt}, ${invoices.sentAt}, ${invoices.issuedAt}, ${invoices.createdAt}))) / 86400) <= 90 THEN '61-90'
    ELSE '90+'
  END
`

function truncFor(granularity: TrendGranularity): 'day' | 'week' | 'month' {
  return granularity
}

export class RealReportingService implements IReportingService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async dashboardKpis(input: DashboardKpisInput): Promise<DashboardKpis> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const from = new Date(input.range.from)
    const to = new Date(input.range.to)
    const orgId = input.organizationId
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

    const [openQuotesRow] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
        total: sql<number>`cast(coalesce(sum(${quotes.totalCents}), 0) as bigint)`,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.organizationId, orgId),
          sql`${quotes.deletedAt} IS NULL`,
          sql`${quotes.status} in ('draft','sent')`,
          gte(quotes.createdAt, from),
          lt(quotes.createdAt, to),
        ),
      )

    const [acceptedQuotesRow] = await db
      .select({
        total: sql<number>`cast(coalesce(sum(${quotes.totalCents}), 0) as bigint)`,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.organizationId, orgId),
          sql`${quotes.deletedAt} IS NULL`,
          eq(quotes.status, 'accepted'),
          gte(quotes.createdAt, from),
          lt(quotes.createdAt, to),
        ),
      )

    const [scheduledWoRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.organizationId, orgId),
          sql`${workOrders.deletedAt} IS NULL`,
          eq(workOrders.status, 'scheduled'),
          gte(workOrders.createdAt, from),
          lt(workOrders.createdAt, to),
        ),
      )

    const [overdueInvoiceRow] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
        balance: sql<number>`cast(coalesce(sum(greatest(0, ${invoices.totalCents} - ${invoices.paidAmountCents})), 0) as bigint)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, orgId),
          sql`${invoices.deletedAt} IS NULL`,
          eq(invoices.status, 'sent'),
          sql`${invoices.paidAt} IS NULL`,
          sql`${invoices.dueAt} IS NOT NULL AND ${invoices.dueAt} < NOW()`,
        ),
      )

    const [paidThisMonthRow] = await db
      .select({
        total: sql<number>`cast(coalesce(sum(${invoicePayments.amountCents}), 0) as bigint)`,
      })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.organizationId, orgId),
          sql`${invoicePayments.deletedAt} IS NULL`,
          gte(invoicePayments.receivedAt, monthStart),
        ),
      )

    const [complianceMonthRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(complianceDocs)
      .where(
        and(
          eq(complianceDocs.organizationId, orgId),
          sql`${complianceDocs.deletedAt} IS NULL`,
          eq(complianceDocs.status, 'ready'),
          gte(complianceDocs.createdAt, monthStart),
        ),
      )

    const [openIssuesRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, orgId),
          sql`${properties.deletedAt} IS NULL`,
          eq(properties.status, 'compliance_pending'),
        ),
      )

    return {
      openQuotesCount: Number(openQuotesRow?.count ?? 0),
      openQuotesValueCents: Number(openQuotesRow?.total ?? 0),
      acceptedQuotesValueCents: Number(acceptedQuotesRow?.total ?? 0),
      scheduledWosCount: Number(scheduledWoRow?.count ?? 0),
      overdueInvoicesCount: Number(overdueInvoiceRow?.count ?? 0),
      overdueInvoicesValueCents: Number(overdueInvoiceRow?.balance ?? 0),
      paidThisMonthCents: Math.max(0, Number(paidThisMonthRow?.total ?? 0)),
      complianceDocsThisMonth: Number(complianceMonthRow?.count ?? 0),
      openComplianceIssues: Number(openIssuesRow?.count ?? 0),
    }
  }

  async quotesByStatus(input: QuotesByStatusInput): Promise<CountByStatus> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const rows = await db
      .select({
        status: quotes.status,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.organizationId, input.organizationId),
          sql`${quotes.deletedAt} IS NULL`,
          gte(quotes.createdAt, new Date(input.range.from)),
          lt(quotes.createdAt, new Date(input.range.to)),
        ),
      )
      .groupBy(quotes.status)
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }))
  }

  async wosByPriority(input: WosByPriorityInput): Promise<CountByStatus> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const rows = await db
      .select({
        status: workOrders.priority,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.organizationId, input.organizationId),
          sql`${workOrders.deletedAt} IS NULL`,
          gte(workOrders.createdAt, new Date(input.range.from)),
          lt(workOrders.createdAt, new Date(input.range.to)),
        ),
      )
      .groupBy(workOrders.priority)
    return rows.map((r) => ({ status: r.status as string, count: Number(r.count) }))
  }

  async arAging(input: ArAgingInput): Promise<ArAgingRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const rows = await db
      .select({
        bucket: AR_BUCKET_CASE.as('bucket'),
        count: sql<number>`cast(count(*) as int)`,
        total: sql<number>`cast(coalesce(sum(greatest(0, ${invoices.totalCents} - ${invoices.paidAmountCents})), 0) as bigint)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, input.organizationId),
          sql`${invoices.deletedAt} IS NULL`,
          sql`${invoices.status} not in ('paid','voided')`,
          sql`(${invoices.totalCents} - ${invoices.paidAmountCents}) > 0`,
        ),
      )
      .groupBy(sql`bucket`)

    const tally: Record<string, { count: number; totalCents: number }> = {
      '0-30': { count: 0, totalCents: 0 },
      '31-60': { count: 0, totalCents: 0 },
      '61-90': { count: 0, totalCents: 0 },
      '90+': { count: 0, totalCents: 0 },
    }
    for (const r of rows) {
      const key = String(r.bucket) as keyof typeof tally
      const slot = tally[key]
      if (slot) {
        slot.count = Number(r.count)
        slot.totalCents = Number(r.total)
      }
    }
    return (['0-30', '31-60', '61-90', '90+'] as const).map((bucket) => ({
      bucket,
      count: tally[bucket]!.count,
      totalCents: tally[bucket]!.totalCents,
    }))
  }

  async revenueTrend(input: RevenueTrendInput): Promise<MoneySeries> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const trunc = truncFor(input.granularity)
    const rows = await db
      .select({
        date: sql<Date>`date_trunc(${trunc}, ${invoicePayments.receivedAt})`,
        cents: sql<number>`cast(coalesce(sum(${invoicePayments.amountCents}), 0) as bigint)`,
      })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.organizationId, input.organizationId),
          sql`${invoicePayments.deletedAt} IS NULL`,
          gte(invoicePayments.receivedAt, new Date(input.range.from)),
          lt(invoicePayments.receivedAt, new Date(input.range.to)),
        ),
      )
      .groupBy(sql`date_trunc(${trunc}, ${invoicePayments.receivedAt})`)
      .orderBy(sql`date_trunc(${trunc}, ${invoicePayments.receivedAt})`)
    return rows.map((r) => ({
      date: (r.date instanceof Date ? r.date : new Date(r.date)).toISOString(),
      cents: Number(r.cents),
    }))
  }

  async topProperties(input: TopPropertiesInput): Promise<TopPropertyRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const limit = Math.max(0, input.limit)

    if (input.by === 'revenue') {
      const rows = await db
        .select({
          propertyId: invoices.propertyId,
          name: properties.addressLine1,
          value: sql<number>`cast(coalesce(sum(${invoicePayments.amountCents}), 0) as bigint)`,
        })
        .from(invoicePayments)
        .innerJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
        .innerJoin(properties, eq(invoices.propertyId, properties.id))
        .where(
          and(
            eq(invoicePayments.organizationId, input.organizationId),
            sql`${invoicePayments.deletedAt} IS NULL`,
            gte(invoicePayments.receivedAt, new Date(input.range.from)),
            lt(invoicePayments.receivedAt, new Date(input.range.to)),
          ),
        )
        .groupBy(invoices.propertyId, properties.addressLine1)
        .orderBy(desc(sql`coalesce(sum(${invoicePayments.amountCents}), 0)`))
        .limit(limit)
      return rows.map((r) => ({
        propertyId: r.propertyId,
        name: r.name ?? r.propertyId,
        value: Math.max(0, Number(r.value)),
      }))
    }

    if (input.by === 'workOrders') {
      const rows = await db
        .select({
          propertyId: workOrders.propertyId,
          name: properties.addressLine1,
          value: sql<number>`cast(count(*) as int)`,
        })
        .from(workOrders)
        .innerJoin(properties, eq(workOrders.propertyId, properties.id))
        .where(
          and(
            eq(workOrders.organizationId, input.organizationId),
            sql`${workOrders.deletedAt} IS NULL`,
            gte(workOrders.createdAt, new Date(input.range.from)),
            lt(workOrders.createdAt, new Date(input.range.to)),
          ),
        )
        .groupBy(workOrders.propertyId, properties.addressLine1)
        .orderBy(desc(sql`count(*)`))
        .limit(limit)
      return rows.map((r) => ({
        propertyId: r.propertyId,
        name: r.name ?? r.propertyId,
        value: Number(r.value),
      }))
    }

    // openIssues — properties whose status is compliance_pending.
    const rows = await db
      .select({
        propertyId: properties.id,
        name: properties.addressLine1,
      })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, input.organizationId),
          sql`${properties.deletedAt} IS NULL`,
          eq(properties.status, 'compliance_pending'),
        ),
      )
      .orderBy(properties.addressLine1)
      .limit(limit)
    return rows.map((r) => ({
      propertyId: r.propertyId,
      name: r.name ?? r.propertyId,
      value: 1,
    }))
  }

  async subcontractorPerformance(
    input: SubcontractorPerformanceInput,
  ): Promise<SubcontractorPerformanceRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    // Slot-level aggregation requires expanding the JSONB array. Postgres
    // supports `jsonb_array_elements` for that; we materialize the slots
    // then group by assigned sub.
    const slotRows = await db.execute<{
      sub_id: string
      wo_id: string
      actual_hours: number | null
      est_hours: number | null
      total_cents: number | null
      slot_count: number
    }>(sql`
      WITH wo_slots AS (
        SELECT
          wo.id AS wo_id,
          wo.organization_id AS org_id,
          (slot->>'assignedSubcontractorId')::uuid AS sub_id,
          NULLIF(slot->>'actualHours', '')::float8 AS actual_hours,
          NULLIF(slot->>'estimatedHours', '')::float8 AS est_hours
        FROM ${workOrders} wo,
        LATERAL jsonb_array_elements(wo.trade_slots) AS slot
        WHERE wo.organization_id = ${input.organizationId}
          AND wo.deleted_at IS NULL
          AND wo.created_at >= ${new Date(input.range.from)}
          AND wo.created_at < ${new Date(input.range.to)}
          AND slot->>'status' = 'completed'
          AND slot->>'assignedSubcontractorId' IS NOT NULL
      ),
      wo_completed_slot_count AS (
        SELECT wo_id, count(*) AS slot_count FROM wo_slots GROUP BY wo_id
      ),
      wo_revenue AS (
        SELECT inv.work_order_id AS wo_id,
               coalesce(sum((inv.totals->>'totalCents')::bigint), 0) AS total_cents
        FROM ${invoices} inv
        WHERE inv.organization_id = ${input.organizationId}
          AND inv.deleted_at IS NULL
          AND inv.work_order_id IS NOT NULL
        GROUP BY inv.work_order_id
      )
      SELECT
        s.sub_id::text AS sub_id,
        s.wo_id::text AS wo_id,
        s.actual_hours,
        s.est_hours,
        coalesce(r.total_cents, 0) AS total_cents,
        c.slot_count AS slot_count
      FROM wo_slots s
      LEFT JOIN wo_completed_slot_count c ON c.wo_id = s.wo_id
      LEFT JOIN wo_revenue r ON r.wo_id = s.wo_id
    `)

    type Agg = {
      completedWos: Set<string>
      totalHours: number
      estHours: number
      revenueCents: number
    }
    const acc = new Map<string, Agg>()
    const rowList = Array.isArray(slotRows) ? slotRows : (slotRows as { rows: typeof slotRows }).rows
    for (const r of rowList as Array<{
      sub_id: string
      wo_id: string
      actual_hours: number | null
      est_hours: number | null
      total_cents: number | string
      slot_count: number | string
    }>) {
      if (!r.sub_id) continue
      const a = acc.get(r.sub_id) ?? {
        completedWos: new Set<string>(),
        totalHours: 0,
        estHours: 0,
        revenueCents: 0,
      }
      a.completedWos.add(r.wo_id)
      a.totalHours += Number(r.actual_hours ?? 0)
      a.estHours += Number(r.est_hours ?? 0)
      const slotCount = Math.max(1, Number(r.slot_count ?? 1))
      a.revenueCents += Number(r.total_cents ?? 0) / slotCount
      acc.set(r.sub_id, a)
    }

    const subIds = Array.from(acc.keys())
    if (subIds.length === 0) return []
    const subRows = await db
      .select({ id: subcontractors.id, name: subcontractors.companyName })
      .from(subcontractors)
      .where(
        and(
          eq(subcontractors.organizationId, input.organizationId),
          sql`${subcontractors.id} IN (${sql.join(
            subIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        ),
      )
    const nameMap = new Map(subRows.map((s) => [s.id, s.name]))
    return Array.from(acc.entries())
      .map(([subId, a]) => ({
        subcontractorId: subId,
        name: nameMap.get(subId) ?? subId,
        completedWos: a.completedWos.size,
        totalHours: a.totalHours,
        totalRevenueCents: Math.round(a.revenueCents),
        varianceHours: a.totalHours - a.estHours,
      }))
      .sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
  }

  async inspectionPassRate(
    input: InspectionPassRateInput,
  ): Promise<InspectionPassRateRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const rows = await db
      .select({
        slug: sql<string>`coalesce(${programs.slug}, 'unassigned')`,
        total: sql<number>`cast(count(*) as int)`,
        pass: sql<number>`cast(sum(case when ${inspections.status} = 'signed' then 1 else 0 end) as int)`,
        warn: sql<number>`cast(sum(case when ${inspections.status} = 'submitted' then 1 else 0 end) as int)`,
        fail: sql<number>`cast(sum(case when ${inspections.status} = 'superseded' then 1 else 0 end) as int)`,
      })
      .from(inspections)
      .leftJoin(programs, eq(programs.id, inspections.programId))
      .where(
        and(
          eq(inspections.organizationId, input.organizationId),
          sql`${inspections.deletedAt} IS NULL`,
          sql`${inspections.status} <> 'draft'`,
          gte(inspections.createdAt, new Date(input.range.from)),
          lt(inspections.createdAt, new Date(input.range.to)),
        ),
      )
      .groupBy(sql`coalesce(${programs.slug}, 'unassigned')`)
    return rows.map((r) => ({
      programSlug: r.slug,
      totalInspections: Number(r.total),
      passCount: Number(r.pass),
      warnCount: Number(r.warn),
      failCount: Number(r.fail),
    }))
  }
}

// Silence unused-import warnings for selectors imported for typing fidelity.
void count
void sum

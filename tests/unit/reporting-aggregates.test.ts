/**
 * tests/unit/reporting-aggregates.test.ts — W3-2 / EH-K (ADR-0030).
 *
 * Validates the `MockReportingService` aggregation contract against
 * the surrounding mock services. Seeds quotes, invoices, payments,
 * and work orders for a fresh org, then asserts the dashboard KPIs.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { MockQuoteService } from '../../shared/mocks/quote.mock'
import { MockInvoiceService } from '../../shared/mocks/invoice.mock'
import { MockInvoicePaymentService } from '../../shared/mocks/invoice-payment.mock'
import { MockWorkOrderService } from '../../shared/mocks/work-order.mock'
import { MockPropertyService } from '../../shared/mocks/property.mock'
import { MockSubcontractorService } from '../../shared/mocks/subcontractor.mock'
import { MockInspectionService } from '../../shared/mocks/inspection.mock'
import { MockComplianceDocService } from '../../shared/mocks/compliance.mock'
import { MockProgramService } from '../../shared/mocks/program.mock'
import { MockJobService } from '../../shared/mocks/job.mock'
import { MockReportingService, type MockReportingDeps } from '../../shared/mocks/reporting.mock'
import type { QuoteCreateInput } from '../../shared/contracts/quote'
import type { InvoiceCreateInput } from '../../shared/contracts/invoice'

function isoDay(offsetDays: number): string {
  const now = new Date()
  return new Date(now.getTime() + offsetDays * 86_400_000).toISOString()
}

function buildDeps(): { deps: MockReportingDeps; orgId: string } {
  const orgId = randomUUID()
  const payments = new MockInvoicePaymentService()
  const invoice = new MockInvoiceService(undefined, payments)
  const job = new MockJobService()
  const deps: MockReportingDeps = {
    quote: new MockQuoteService(),
    invoice,
    invoicePayment: payments,
    workOrder: new MockWorkOrderService(),
    property: new MockPropertyService(),
    subcontractor: new MockSubcontractorService(),
    inspection: new MockInspectionService(undefined, async () => null),
    complianceDoc: new MockComplianceDocService(undefined, () => job),
    program: new MockProgramService(),
  }
  return { deps, orgId }
}

describe('MockReportingService.dashboardKpis (W3-2 / EH-K)', () => {
  let deps: MockReportingDeps
  let orgId: string
  let reporting: MockReportingService

  beforeEach(() => {
    ;({ deps, orgId } = buildDeps())
    reporting = new MockReportingService(deps)
  })

  it('returns zeroed KPIs for a fresh org', async () => {
    const kpis = await reporting.dashboardKpis({
      organizationId: orgId,
      range: { from: isoDay(-30), to: isoDay(1) },
    })
    expect(kpis.openQuotesCount).toBe(0)
    expect(kpis.openQuotesValueCents).toBe(0)
    expect(kpis.acceptedQuotesValueCents).toBe(0)
    expect(kpis.scheduledWosCount).toBe(0)
    expect(kpis.overdueInvoicesCount).toBe(0)
    expect(kpis.paidThisMonthCents).toBe(0)
  })

  it('counts open quotes (draft + sent) within the range', async () => {
    const propertyId = randomUUID()
    const baseInput = {
      organizationId: orgId,
      propertyId,
      assessmentId: null,
      createdById: randomUUID(),
      expiresAt: null,
      lineItems: [
        { id: randomUUID(), kind: 'labor', description: 'r', quantity: 1, unitCostCents: 500_00 },
      ],
      markupPercent: 0,
      taxPercent: 0,
      notes: null,
    } as QuoteCreateInput
    await deps.quote.create(baseInput)
    const sent = await deps.quote.create(baseInput)
    await deps.quote.markSent(sent.id, orgId)

    const kpis = await reporting.dashboardKpis({
      organizationId: orgId,
      range: { from: isoDay(-30), to: isoDay(1) },
    })
    expect(kpis.openQuotesCount).toBe(2)
    expect(kpis.openQuotesValueCents).toBeGreaterThan(0)
  })

  it('sums paid-this-month from the payment ledger', async () => {
    const propertyId = randomUUID()
    const inv = await deps.invoice.create({
      organizationId: orgId,
      propertyId,
      workOrderId: randomUUID(),
      quoteId: randomUUID(),
      lineItems: [
        { id: randomUUID(), kind: 'labor', description: 'r', quantity: 1, unitCostCents: 200_00 },
      ],
      markupPercent: 0,
      taxPercent: 0,
      dueAt: null,
      notes: null,
    } as InvoiceCreateInput)
    await deps.invoice.markSent(inv.id, orgId)
    await deps.invoice.recordPayment({
      invoiceId: inv.id,
      organizationId: orgId,
      amountCents: 150_00,
      method: 'check',
    })

    const kpis = await reporting.dashboardKpis({
      organizationId: orgId,
      range: { from: isoDay(-30), to: isoDay(1) },
    })
    expect(kpis.paidThisMonthCents).toBe(150_00)
  })

  it('isolates results across organizations (tenant firewall via reads)', async () => {
    const otherOrg = randomUUID()
    await deps.quote.create({
      organizationId: otherOrg,
      propertyId: randomUUID(),
      assessmentId: null,
      createdById: randomUUID(),
      expiresAt: null,
      lineItems: [
        { id: randomUUID(), kind: 'labor', description: 'r', quantity: 1, unitCostCents: 999_00 },
      ],
      markupPercent: 0,
      taxPercent: 0,
      notes: null,
    } as QuoteCreateInput)

    const kpis = await reporting.dashboardKpis({
      organizationId: orgId,
      range: { from: isoDay(-30), to: isoDay(1) },
    })
    expect(kpis.openQuotesCount).toBe(0)
  })
})

describe('MockReportingService.quotesByStatus (W3-2 / EH-K)', () => {
  it('tallies quotes by status within the range', async () => {
    const { deps, orgId } = buildDeps()
    const reporting = new MockReportingService(deps)
    const baseInput = {
      organizationId: orgId,
      propertyId: randomUUID(),
      assessmentId: null,
      createdById: randomUUID(),
      expiresAt: null,
      lineItems: [
        { id: randomUUID(), kind: 'labor', description: 'r', quantity: 1, unitCostCents: 100_00 },
      ],
      markupPercent: 0,
      taxPercent: 0,
      notes: null,
    } as QuoteCreateInput
    await deps.quote.create(baseInput)
    const sent = await deps.quote.create(baseInput)
    await deps.quote.markSent(sent.id, orgId)

    const rows = await reporting.quotesByStatus({
      organizationId: orgId,
      range: { from: isoDay(-30), to: isoDay(1) },
    })
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.count]))
    expect(byStatus.draft).toBe(1)
    expect(byStatus.sent).toBe(1)
  })
})

/**
 * tests/unit/invoice-payments.test.ts — W2-3 / EH-G (ADR-0020).
 *
 * Validates the partial-payment ledger semantics on the mock services.
 * Real-DB coverage lives in tests/integration/invoice.real.test.ts; this
 * file focuses on the contract envelope: status transitions, ledger
 * sum, void semantics.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { MockInvoiceService } from '../../shared/mocks/invoice.mock'
import { MockInvoicePaymentService } from '../../shared/mocks/invoice-payment.mock'
import type { InvoiceCreateInput } from '../../shared/contracts/invoice'

function freshCtx() {
  return {
    organizationId: randomUUID(),
    propertyId: randomUUID(),
    workOrderId: randomUUID(),
    quoteId: randomUUID(),
  }
}

function baseInput(ctx: ReturnType<typeof freshCtx>, unitCostCents = 100_00): InvoiceCreateInput {
  return {
    organizationId: ctx.organizationId,
    propertyId: ctx.propertyId,
    workOrderId: ctx.workOrderId,
    quoteId: ctx.quoteId,
    lineItems: [
      { id: randomUUID(), kind: 'labor', description: 'repair', quantity: 1, unitCostCents },
    ],
    markupPercent: 0,
    taxPercent: 0,
    dueAt: null,
    notes: null,
  } as InvoiceCreateInput
}

describe('Invoice partial-payments (W2-3 / EH-G)', () => {
  let ctx: ReturnType<typeof freshCtx>
  let payments: MockInvoicePaymentService
  let invoices: MockInvoiceService

  beforeEach(() => {
    ctx = freshCtx()
    payments = new MockInvoicePaymentService()
    invoices = new MockInvoiceService(undefined, payments)
  })

  it('recordPayment() under the total transitions invoice to "partial"', async () => {
    const inv = await invoices.create(baseInput(ctx, 100_00))
    await invoices.markSent(inv.id, ctx.organizationId)
    const after = await invoices.recordPayment({
      invoiceId: inv.id,
      organizationId: ctx.organizationId,
      amountCents: 40_00,
      method: 'check',
    })
    expect(after.status).toBe('partial')
    expect(after.paidAmountCents).toBe(40_00)
    const ledger = await payments.listForInvoice(inv.id, ctx.organizationId)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]!.amountCents).toBe(40_00)
  })

  it('multiple recordPayment() calls sum the ledger and flip to "paid" at total', async () => {
    const inv = await invoices.create(baseInput(ctx, 100_00))
    await invoices.markSent(inv.id, ctx.organizationId)
    await invoices.recordPayment({
      invoiceId: inv.id,
      organizationId: ctx.organizationId,
      amountCents: 40_00,
      method: 'check',
    })
    const final = await invoices.recordPayment({
      invoiceId: inv.id,
      organizationId: ctx.organizationId,
      amountCents: 60_00,
      method: 'ach',
    })
    expect(final.status).toBe('paid')
    expect(final.paidAmountCents).toBe(100_00)
    expect(final.paidAt).not.toBeNull()
  })

  it('recordPayment() refuses a draft invoice', async () => {
    const inv = await invoices.create(baseInput(ctx))
    await expect(
      invoices.recordPayment({
        invoiceId: inv.id,
        organizationId: ctx.organizationId,
        amountCents: 1000,
        method: 'check',
      }),
    ).rejects.toThrow(/draft/i)
  })

  it('voidInvoice() flips status to "voided" and stamps reason', async () => {
    const inv = await invoices.create(baseInput(ctx))
    await invoices.markSent(inv.id, ctx.organizationId)
    const voided = await invoices.voidInvoice({
      invoiceId: inv.id,
      organizationId: ctx.organizationId,
      reason: 'duplicate',
    })
    expect(voided.status).toBe('voided')
    expect(voided.voidedReason).toBe('duplicate')
    expect(voided.voidedAt).not.toBeNull()
  })

  it('voidInvoice() refuses an already-paid invoice', async () => {
    const inv = await invoices.create(baseInput(ctx, 50_00))
    await invoices.markSent(inv.id, ctx.organizationId)
    await invoices.recordPayment({
      invoiceId: inv.id,
      organizationId: ctx.organizationId,
      amountCents: 50_00,
      method: 'cash',
    })
    await expect(
      invoices.voidInvoice({
        invoiceId: inv.id,
        organizationId: ctx.organizationId,
        reason: 'oops',
      }),
    ).rejects.toThrow(/paid/i)
  })

  it('voidPayment() soft-deletes the ledger row', async () => {
    const inv = await invoices.create(baseInput(ctx, 100_00))
    await invoices.markSent(inv.id, ctx.organizationId)
    await invoices.recordPayment({
      invoiceId: inv.id,
      organizationId: ctx.organizationId,
      amountCents: 30_00,
      method: 'check',
    })
    const ledger = await payments.listForInvoice(inv.id, ctx.organizationId)
    await payments.voidPayment(ledger[0]!.id, ctx.organizationId)
    const after = await payments.listForInvoice(inv.id, ctx.organizationId)
    expect(after).toHaveLength(0)
  })
})

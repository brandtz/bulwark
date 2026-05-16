/**
 * tests/unit/change-orders.test.ts — W2-3 / EH-G (ADR-0020).
 *
 * Validates the at-least-one-of attachment rule, the
 * propose → approve / reject lifecycle, and the apply-on-approve
 * side effects via injected hooks.
 */
import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { MockChangeOrderService, type ChangeOrderApplyHooks } from '../../shared/mocks/change-order.mock'

function ctxBase() {
  return {
    organizationId: randomUUID(),
    workOrderId: randomUUID(),
    invoiceId: randomUUID(),
    proposedByUserId: randomUUID(),
  }
}

describe('MockChangeOrderService — W2-3 / EH-G', () => {
  it('propose() requires either a workOrderId or an invoiceId', async () => {
    const svc = new MockChangeOrderService()
    const ctx = ctxBase()
    await expect(
      svc.propose({
        organizationId: ctx.organizationId,
        workOrderId: null,
        invoiceId: null,
        title: 'Extra',
        description: 'd',
        amountCents: 500,
        proposedByUserId: ctx.proposedByUserId,
      }),
    ).rejects.toThrow(/work order or invoice/i)
  })

  it('approve() appends an invoice line via the hook', async () => {
    const ctx = ctxBase()
    const appendInvoiceLine = vi.fn().mockResolvedValue({})
    const appendWorkOrderNote = vi.fn().mockResolvedValue({})
    const hooks: ChangeOrderApplyHooks = { appendInvoiceLine, appendWorkOrderNote }
    const svc = new MockChangeOrderService(undefined, hooks)
    const co = await svc.propose({
      organizationId: ctx.organizationId,
      workOrderId: null,
      invoiceId: ctx.invoiceId,
      title: 'Add scope',
      description: 'extra demo',
      amountCents: 25_000,
      proposedByUserId: ctx.proposedByUserId,
    })
    const approved = await svc.approve({
      id: co.id,
      organizationId: ctx.organizationId,
      approvedByName: 'Owner',
      signatureUrl: null,
    })
    expect(approved.status).toBe('approved')
    expect(approved.approvedAt).not.toBeNull()
    expect(appendInvoiceLine).toHaveBeenCalledTimes(1)
    const call = appendInvoiceLine.mock.calls[0]
    expect(call?.[0]).toBe(ctx.invoiceId)
    expect(call?.[2].unitCostCents).toBe(25_000)
    expect(appendWorkOrderNote).not.toHaveBeenCalled()
  })

  it('approve() falls back to appendWorkOrderNote when only WO attached', async () => {
    const ctx = ctxBase()
    const appendInvoiceLine = vi.fn().mockResolvedValue({})
    const appendWorkOrderNote = vi.fn().mockResolvedValue({})
    const svc = new MockChangeOrderService(undefined, { appendInvoiceLine, appendWorkOrderNote })
    const co = await svc.propose({
      organizationId: ctx.organizationId,
      workOrderId: ctx.workOrderId,
      invoiceId: null,
      title: 'Extra trip',
      description: 'd',
      amountCents: 1000,
      proposedByUserId: ctx.proposedByUserId,
    })
    await svc.approve({
      id: co.id,
      organizationId: ctx.organizationId,
      approvedByName: 'Owner',
    })
    expect(appendWorkOrderNote).toHaveBeenCalledTimes(1)
    expect(appendInvoiceLine).not.toHaveBeenCalled()
  })

  it('approve() is idempotent — second call returns the existing approved row', async () => {
    const ctx = ctxBase()
    const svc = new MockChangeOrderService()
    const co = await svc.propose({
      organizationId: ctx.organizationId,
      workOrderId: ctx.workOrderId,
      invoiceId: null,
      title: 'x',
      description: 'y',
      amountCents: 1,
      proposedByUserId: null,
    })
    const a = await svc.approve({ id: co.id, organizationId: ctx.organizationId, approvedByName: 'O' })
    const b = await svc.approve({ id: co.id, organizationId: ctx.organizationId, approvedByName: 'O2' })
    expect(b.id).toBe(a.id)
    expect(b.approvedByName).toBe('O') // first approval wins
  })

  it('reject() refuses an already-approved change order', async () => {
    const ctx = ctxBase()
    const svc = new MockChangeOrderService()
    const co = await svc.propose({
      organizationId: ctx.organizationId,
      workOrderId: ctx.workOrderId,
      invoiceId: null,
      title: 'x',
      description: 'y',
      amountCents: 1,
      proposedByUserId: null,
    })
    await svc.approve({ id: co.id, organizationId: ctx.organizationId, approvedByName: 'O' })
    await expect(
      svc.reject({ id: co.id, organizationId: ctx.organizationId, reason: 'nvm' }),
    ).rejects.toThrow(/approved/i)
  })

  it('reject() captures reason and stamps status', async () => {
    const ctx = ctxBase()
    const svc = new MockChangeOrderService()
    const co = await svc.propose({
      organizationId: ctx.organizationId,
      workOrderId: ctx.workOrderId,
      invoiceId: null,
      title: 'x',
      description: 'y',
      amountCents: 1,
      proposedByUserId: null,
    })
    const r = await svc.reject({ id: co.id, organizationId: ctx.organizationId, reason: 'too much' })
    expect(r.status).toBe('rejected')
    expect(r.rejectedReason).toBe('too much')
    expect(r.rejectedAt).not.toBeNull()
  })
})

/**
 * tests/unit/quote-tiers.test.ts — W2-3 / EH-G (ADR-0020).
 *
 * Exercises the MockQuoteService against the new tier / revision /
 * rejection / expiry contract. The mock mirrors the real service's
 * invariants 1:1 so this layer is fast (no DB) but catches regressions
 * in the contract surface itself.
 *
 * # Decisions (ADR-0008)
 *   - We test the mock, not the real service, because the real
 *     integration tests need a running Postgres and W2-3 covers them
 *     at the integration layer (tests/integration/quote.real.test.ts
 *     adds the bare-CRUD coverage; this file owns the new branches).
 *   - Each test creates its own organizationId so state from one
 *     test doesn't bleed into the next (the mock store is module-
 *     scoped).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { MockQuoteService } from '../../shared/mocks/quote.mock'
import type { QuoteCreateInput } from '../../shared/contracts/quote'

function freshOrg() {
  return {
    organizationId: randomUUID(),
    propertyId: randomUUID(),
    createdById: randomUUID(),
  }
}

function baseInput(over: Partial<QuoteCreateInput> & { organizationId: string; propertyId: string; createdById: string }): QuoteCreateInput {
  const { organizationId, propertyId, createdById, ...rest } = over
  return {
    organizationId,
    propertyId,
    assessmentId: null,
    createdById,
    expiresAt: null,
    lineItems: [
      { id: randomUUID(), kind: 'labor', description: 'roof', quantity: 1, unitCostCents: 100000, sourceField: '' },
    ],
    markupPercent: 0,
    taxPercent: 0,
    notes: null,
    ...rest,
  }
}

describe('MockQuoteService — W2-3 tiers + revisions', () => {
  let ctx: ReturnType<typeof freshOrg>
  let svc: MockQuoteService

  beforeEach(() => {
    ctx = freshOrg()
    svc = new MockQuoteService()
  })

  it('create() defaults tier to "custom" when not provided', async () => {
    const q = await svc.create(baseInput(ctx))
    expect(q.tier).toBe('custom')
    expect(q.revisionNumber).toBe(1)
    expect(q.parentQuoteId).toBeNull()
    expect(q.revisionGroupId).toBeNull()
  })

  it('create() honors explicit tier override', async () => {
    const q = await svc.create(baseInput({ ...ctx, tier: 'better' }))
    expect(q.tier).toBe('better')
  })

  it('revise() stamps a revisionGroupId on the source and increments revisionNumber', async () => {
    const a = await svc.create(baseInput(ctx))
    expect(a.revisionGroupId).toBeNull()
    const b = await svc.revise(a.id, ctx.organizationId)
    expect(b.parentQuoteId).toBe(a.id)
    expect(b.revisionNumber).toBe(2)
    expect(b.revisionGroupId).toBe(a.id)
    const aReread = await svc.get(a.id, ctx.organizationId)
    expect(aReread?.revisionGroupId).toBe(a.id)
    const c = await svc.revise(b.id, ctx.organizationId)
    expect(c.revisionNumber).toBe(3)
    expect(c.revisionGroupId).toBe(a.id)
  })

  it('revise() resets status to draft and clears sent/accepted timestamps', async () => {
    const a = await svc.create(baseInput(ctx))
    await svc.markSent(a.id, ctx.organizationId)
    const b = await svc.revise(a.id, ctx.organizationId)
    expect(b.status).toBe('draft')
    expect(b.sentAt).toBeNull()
    expect(b.acceptedAt).toBeNull()
  })
})

describe('MockQuoteService — W2-3 rejection', () => {
  it('reject() captures reason + reasonCode and stamps status', async () => {
    const ctx = freshOrg()
    const svc = new MockQuoteService()
    const q = await svc.create(baseInput(ctx))
    await svc.markSent(q.id, ctx.organizationId)
    const r = await svc.reject({
      id: q.id,
      organizationId: ctx.organizationId,
      reason: 'too expensive',
      reasonCode: 'price',
    })
    expect(r.status).toBe('rejected')
    expect(r.rejectedReason).toBe('too expensive')
    expect(r.rejectedReasonCode).toBe('price')
  })

  it('reject() refuses an accepted quote', async () => {
    const ctx = freshOrg()
    const svc = new MockQuoteService()
    const q = await svc.create(baseInput(ctx))
    await svc.markSent(q.id, ctx.organizationId)
    await svc.markAccepted(q.id, ctx.organizationId)
    await expect(
      svc.reject({ id: q.id, organizationId: ctx.organizationId, reason: 'x', reasonCode: 'other' }),
    ).rejects.toThrow(/accepted/i)
  })
})

describe('MockQuoteService — W2-3 expiry', () => {
  it('expire() is idempotent', async () => {
    const ctx = freshOrg()
    const svc = new MockQuoteService()
    const q = await svc.create(baseInput(ctx))
    await svc.markSent(q.id, ctx.organizationId)
    const first = await svc.expire(q.id, ctx.organizationId)
    expect(first.status).toBe('expired')
    const second = await svc.expire(q.id, ctx.organizationId)
    expect(second.status).toBe('expired')
    expect(second.id).toBe(first.id)
  })

  it('expireBatch() picks up sent quotes whose expiryDate is in the past', async () => {
    const ctx = freshOrg()
    const svc = new MockQuoteService()
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const stale = await svc.create(baseInput({ ...ctx, expiryDate: past }))
    const fresh = await svc.create(baseInput({ ...ctx, expiryDate: future }))
    await svc.markSent(stale.id, ctx.organizationId)
    await svc.markSent(fresh.id, ctx.organizationId)
    const out = await svc.expireBatch({ organizationId: ctx.organizationId })
    expect(out.map((r) => r.id)).toEqual([stale.id])
    const freshReread = await svc.get(fresh.id, ctx.organizationId)
    expect(freshReread?.status).toBe('sent')
  })
})

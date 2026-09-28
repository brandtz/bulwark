/**
 * tests/integration/numbering-race.test.ts — WP-L06 S2 race-safe numbering.
 *
 * Needs a real Postgres (auto-skips without DATABASE_URL). N concurrent
 * creates in one org must get N distinct, gap-free sequential numbers (the old
 * COUNT(*)+1 handed out duplicates under exactly this load); legacy numbers are
 * continued, never reused; the per-org UNIQUE backstop exists and is what
 * `withNumberRetry` keys on.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { auditLog, invoices, organizations, orgNumberCounters, properties, quotes, users, workOrders } from '../../server/db/schema'
import { RealQuoteService } from '../../server/services/quote.real'
import { RealInvoiceService } from '../../server/services/invoice.real'
import { RealWorkOrderService } from '../../server/services/work-order.real'
import { isNumberConflict, numberPeriod, withNumberRetry } from '../../server/services/_numbering'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

const N = 12
const YEAR = new Date().getUTCFullYear()

d('race-safe document numbering (WP-L06 S2)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const orgIds: string[] = []
  let userId: string
  const propertyByOrg = new Map<string, string>()

  const mkOrg = async (label: string) => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: `L06 ${label}`, slug: `l06-${label}-${stamp}` }).returning()
    const [p] = await db.insert(properties).values({ organizationId: o!.id, addressLine1: 'N', city: 'C', state: 'CA', postalCode: '0' }).returning()
    orgIds.push(o!.id)
    propertyByOrg.set(o!.id, p!.id)
    return o!.id
  }

  beforeAll(async () => {
    const db = getDb()
    const [u] = await db.insert(users).values({ email: `l06-${stamp}@x.test`, fullName: 'T', passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userId = u!.id
  })

  afterAll(async () => {
    const db = getDb()
    if (orgIds.length) {
      await db.delete(auditLog).where(inArray(auditLog.organizationId, orgIds))
      await db.delete(invoices).where(inArray(invoices.organizationId, orgIds))
      await db.delete(workOrders).where(inArray(workOrders.organizationId, orgIds))
      await db.delete(quotes).where(inArray(quotes.organizationId, orgIds))
      await db.delete(properties).where(inArray(properties.organizationId, orgIds))
      await db.delete(orgNumberCounters).where(inArray(orgNumberCounters.organizationId, orgIds))
      await db.delete(organizations).where(inArray(organizations.id, orgIds))
    }
    await db.delete(users).where(eq(users.id, userId))
  })

  const quoteInput = (organizationId: string) => ({
    organizationId,
    propertyId: propertyByOrg.get(organizationId)!,
    assessmentId: null,
    createdById: userId,
    expiresAt: null,
    lineItems: [{ id: randomUUID(), kind: 'labor' as const, description: 'x', quantity: 1, unitCostCents: 100, sourceField: '' }],
    markupPercent: 0,
    taxPercent: 0,
    notes: null,
  })

  const seqs = (numbers: string[]) => numbers.map((n) => Number(n.split('-').pop())).sort((a, b) => a - b)

  it(`${N} concurrent quote creates get distinct, consecutive numbers`, async () => {
    const org = await mkOrg('quotes')
    const svc = new RealQuoteService()
    const created = await Promise.all(Array.from({ length: N }, () => svc.create(quoteInput(org))))
    const numbers = created.map((q) => q.quoteNumber)
    expect(new Set(numbers).size).toBe(N)
    expect(seqs(numbers)).toEqual(Array.from({ length: N }, (_, i) => i + 1))
    expect(numbers.every((n) => n.startsWith(`Q-${YEAR}-`))).toBe(true)
  })

  it('work orders and invoices are race-safe too, with independent series per org', async () => {
    const org = await mkOrg('wo-inv')
    const other = await mkOrg('other')
    const wo = new RealWorkOrderService()
    const inv = new RealInvoiceService()
    const quote = await new RealQuoteService().create(quoteInput(org)) // work_orders.quote_id is NOT NULL
    const woInput = (organizationId: string) => ({
      organizationId,
      propertyId: propertyByOrg.get(organizationId)!,
      quoteId: quote.id,
      scheduledStart: null,
      scheduledEnd: null,
      tradeSlots: [],
      materials: [],
      notes: null,
      createdById: userId,
    })
    const invInput = (organizationId: string) => ({
      organizationId,
      propertyId: propertyByOrg.get(organizationId)!,
      workOrderId: null,
      quoteId: null,
      dueAt: null,
      lineItems: [{ id: randomUUID(), kind: 'labor' as const, description: 'x', quantity: 1, unitCostCents: 100 }],
      markupPercent: 0,
      taxPercent: 0,
      notes: null,
    })
    const [wos, invs, otherInvs] = await Promise.all([
      Promise.all(Array.from({ length: N }, () => wo.create(woInput(org) as never))),
      Promise.all(Array.from({ length: N }, () => inv.create(invInput(org) as never))),
      Promise.all(Array.from({ length: 3 }, () => inv.create(invInput(other) as never))),
    ])
    expect(seqs(wos.map((w) => w.workOrderNumber))).toEqual(Array.from({ length: N }, (_, i) => i + 1))
    expect(seqs(invs.map((i) => i.invoiceNumber))).toEqual(Array.from({ length: N }, (_, i) => i + 1))
    expect(seqs(otherInvs.map((i) => i.invoiceNumber))).toEqual([1, 2, 3])
  })

  it('continues after legacy numbers and skips a taken one instead of reusing it', async () => {
    const org = await mkOrg('legacy')
    const db = getDb()
    const base = { propertyId: propertyByOrg.get(org)!, createdById: userId, lineItems: [], totals: { subtotalCents: 0, markupCents: 0, taxCents: 0, totalCents: 0 } }
    // Pre-L06 rows: 2 counted by the LIKE seed, plus #0004 sitting past the seed.
    await db.insert(quotes).values([
      { ...base, organizationId: org, quoteNumber: `Q-${YEAR}-0001` },
      { ...base, organizationId: org, quoteNumber: `Q-${YEAR}-0004` },
    ] as never)
    const svc = new RealQuoteService()
    const a = await svc.create(quoteInput(org))
    const b = await svc.create(quoteInput(org))
    expect(a.quoteNumber).toBe(`Q-${YEAR}-0003`) // seed = COUNT 2 → next 3
    expect(b.quoteNumber).toBe(`Q-${YEAR}-0005`) // 0004 is taken → skipped
  })

  it('UNIQUE(org, number) backstop rejects a duplicate and is recognized for retry', async () => {
    const org = await mkOrg('unique')
    const db = getDb()
    const base = { organizationId: org, propertyId: propertyByOrg.get(org)!, createdById: userId, lineItems: [], totals: { subtotalCents: 0, markupCents: 0, taxCents: 0, totalCents: 0 }, quoteNumber: 'DUP-1' }
    await db.insert(quotes).values(base as never)
    const err = await db.insert(quotes).values(base as never).then(() => null, (e: unknown) => e)
    expect(err).not.toBeNull()
    expect(isNumberConflict(err)).toBe(true)

    let calls = 0
    const out = await withNumberRetry(async () => {
      calls++
      if (calls === 1) throw err
      return 'ok'
    })
    expect(out).toBe('ok')
    expect(calls).toBe(2)
    await expect(withNumberRetry(async () => { throw new Error('other') })).rejects.toThrow('other')
  })

  it('a format without {year} is one running series (period 0)', () => {
    expect(numberPeriod('Q-{seq:05}', new Date('2031-01-01T00:00:00Z'))).toBe(0)
    expect(numberPeriod('Q-{year}-{seq}', new Date('2031-06-01T00:00:00Z'))).toBe(2031)
  })
})

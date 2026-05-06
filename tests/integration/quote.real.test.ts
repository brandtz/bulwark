/**
 * tests/integration/quote.real.test.ts — RealQuoteService (E11-S7).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, randomUUID as _ } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { quotes } from '../../server/db/schema/quotes'
import { properties } from '../../server/db/schema/properties'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { users } from '../../server/db/schema/users'
import { RealQuoteService } from '../../server/services/quote.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealQuoteService (E11-S7)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string
  let userId: string
  let propertyId: string

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'E11-S7 Org', slug: `e11s7-${stamp}` }).returning()
    orgId = o.id
    const [u] = await db.insert(users).values({ email: `e11s7-${stamp}@x.test`, fullName: 'T', passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userId = u.id
    const [p] = await db.insert(properties).values({ organizationId: orgId, addressLine1: 'Q', city: 'C', state: 'CA', postalCode: '0' }).returning()
    propertyId = p.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(quotes).where(eq(quotes.organizationId, orgId))
    await db.delete(properties).where(eq(properties.organizationId, orgId))
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  const lineItems = () => [
    { id: randomUUID(), kind: 'labor' as const, description: 'demo', quantity: 1, unitCostCents: 10000, sourceField: '' },
    { id: randomUUID(), kind: 'material' as const, description: 'paint', quantity: 2, unitCostCents: 5000, sourceField: '' },
  ]
  const baseInput = () => ({
    organizationId: orgId,
    propertyId,
    assessmentId: null,
    createdById: userId,
    expiresAt: null,
    lineItems: lineItems(),
    markupPercent: 10,
    taxPercent: 8,
    notes: null,
  })

  it('create() recomputes totals server-side and assigns Q-YYYY-#### number', async () => {
    const svc = new RealQuoteService()
    const q = await svc.create(baseInput())
    expect(q.quoteNumber).toMatch(/^Q-\d{4}-\d{4}$/)
    // 10000 + 10000 = 20000 subtotal, 10% markup = 2000, 8% tax on 22000 = 1760, total 23760
    expect(q.totals.subtotalCents).toBe(20000)
    expect(q.totals.markupCents).toBe(2000)
    expect(q.totals.totalCents).toBe(q.totals.subtotalCents + q.totals.markupCents + q.totals.taxCents)
    expect(q.status).toBe('draft')
  })

  it('list() filters by propertyId and status', async () => {
    const svc = new RealQuoteService()
    await svc.create(baseInput())
    const r = await svc.list({ organizationId: orgId, propertyId, page: 1, pageSize: 100 })
    expect(r.total).toBeGreaterThanOrEqual(1)
    expect(r.rows.every((x) => x.propertyId === propertyId)).toBe(true)
    const draftOnly = await svc.list({ organizationId: orgId, status: 'draft', page: 1, pageSize: 100 })
    expect(draftOnly.rows.every((x) => x.status === 'draft')).toBe(true)
  })

  it('markSent() is idempotent and writes a state_change audit row', async () => {
    const svc = new RealQuoteService()
    const q = await svc.create(baseInput())
    const sent1 = await svc.markSent(q.id, orgId)
    expect(sent1.status).toBe('sent')
    expect(sent1.sentAt).not.toBeNull()
    const sent2 = await svc.markSent(q.id, orgId)
    expect(sent2.id).toBe(sent1.id)
    expect(sent2.status).toBe('sent')
    const db = getDb()
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, q.id))
    expect(rows.some((r) => r.action === 'state_change')).toBe(true)
  })

  it('markAccepted() rejects draft quotes', async () => {
    const svc = new RealQuoteService()
    const q = await svc.create(baseInput())
    await expect(svc.markAccepted(q.id, orgId)).rejects.toThrow(/sent/i)
  })

  it('markAccepted() flows from sent to accepted', async () => {
    const svc = new RealQuoteService()
    const q = await svc.create(baseInput())
    await svc.markSent(q.id, orgId)
    const accepted = await svc.markAccepted(q.id, orgId)
    expect(accepted.status).toBe('accepted')
    expect(accepted.acceptedAt).not.toBeNull()
  })

  it('tenant firewall blocks cross-tenant create', async () => {
    const resolver = () => ({ userId, organizationId: '00000000-0000-4000-8000-000000000bbb' })
    const svc = new RealQuoteService(resolver)
    await expect(svc.create(baseInput())).rejects.toBeInstanceOf(TenantViolationError)
  })
})

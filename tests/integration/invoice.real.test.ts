/**
 * tests/integration/invoice.real.test.ts — RealInvoiceService (E11-S11).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { invoices } from '../../server/db/schema/invoices'
import { properties } from '../../server/db/schema/properties'
import { users } from '../../server/db/schema/users'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { RealInvoiceService } from '../../server/services/invoice.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealInvoiceService (E11-S11)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string
  let userId: string
  let propertyId: string

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'E11-S11 Org', slug: `e11s11-${stamp}` }).returning()
    orgId = o!.id
    const [u] = await db.insert(users).values({ email: `e11s11-${stamp}@x.test`, fullName: 'T', passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userId = u!.id
    const [p] = await db.insert(properties).values({ organizationId: orgId, addressLine1: 'I', city: 'C', state: 'CA', postalCode: '0' }).returning()
    propertyId = p!.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(invoices).where(eq(invoices.organizationId, orgId))
    await db.delete(properties).where(eq(properties.organizationId, orgId))
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  const baseInput = () => ({
    organizationId: orgId,
    propertyId,
    workOrderId: null,
    quoteId: null,
    dueAt: null,
    lineItems: [
      { id: randomUUID(), kind: 'labor' as const, description: 'h', quantity: 1, unitCostCents: 50000 },
    ],
    markupPercent: 0,
    taxPercent: 10,
    notes: null,
  })

  it('create() recomputes totals and assigns INV-YYYY-####', async () => {
    const svc = new RealInvoiceService()
    const inv = await svc.create(baseInput())
    expect(inv.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/)
    expect(inv.totals.subtotalCents).toBe(50000)
    expect(inv.totals.taxCents).toBe(5000)
    expect(inv.totals.totalCents).toBe(55000)
    expect(inv.status).toBe('draft')
  })

  it('markPaid() rejects draft, succeeds after sent', async () => {
    const svc = new RealInvoiceService()
    const inv = await svc.create(baseInput())
    await expect(svc.markPaid(inv.id, orgId)).rejects.toThrow(/sent/i)
    await svc.markSent(inv.id, orgId)
    const paid = await svc.markPaid(inv.id, orgId)
    expect(paid.status).toBe('paid')
    expect(paid.paidAmountCents).toBe(paid.totals.totalCents)
  })

  it('list() filters by status', async () => {
    const svc = new RealInvoiceService()
    const r = await svc.list({ organizationId: orgId, status: 'paid', page: 1, pageSize: 100 })
    expect(r.rows.every((x) => x.status === 'paid')).toBe(true)
  })

  it('tenant firewall', async () => {
    const resolver = () => ({ userId, organizationId: '00000000-0000-4000-8000-000000000ddd' })
    const svc = new RealInvoiceService(resolver)
    await expect(svc.create(baseInput())).rejects.toBeInstanceOf(TenantViolationError)
  })
})

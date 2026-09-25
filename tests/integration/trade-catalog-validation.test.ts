import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { workOrders } from '../../server/db/schema/work_orders'
import { quotes } from '../../server/db/schema/quotes'
import { properties } from '../../server/db/schema/properties'
import { users } from '../../server/db/schema/users'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { trades } from '../../server/db/schema/trades'
import { subcontractors } from '../../server/db/schema/subcontractors'
import { RealSubcontractorService } from '../../server/services/subcontractor.real'
import { RealTradeService } from '../../server/services/trade.real'
import { RealWorkOrderService } from '../../server/services/work-order.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('trade catalog validation (real backend)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const customTrade = `framing-${Date.now()}`
  let organizationId: string
  let userId: string
  let propertyId: string
  let quoteId: string

  beforeAll(async () => {
    const db = getDb()
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Trade Catalog Org', slug: `tradecat-${stamp}` })
      .returning()
    organizationId = organization!.id
    const [user] = await db
      .insert(users)
      .values({
        email: `tradecat-${stamp}@x.test`,
        fullName: 'Trade Catalog Test',
        passwordHash: await bcrypt.hash('test', 4),
        isActive: true,
      })
      .returning()
    userId = user!.id
    const [property] = await db
      .insert(properties)
      .values({ organizationId, addressLine1: '1 Trade Way', city: 'Test', state: 'CA', postalCode: '90000' })
      .returning()
    propertyId = property!.id
    const [quote] = await db
      .insert(quotes)
      .values({
        organizationId,
        propertyId,
        assessmentId: null,
        createdById: userId,
        quoteNumber: `Q-TRADE-${stamp}`,
        status: 'accepted',
        lineItems: [],
        markupPercent: 0,
        taxPercent: 0,
        notes: null,
        totals: { subtotalCents: 0, markupCents: 0, taxCents: 0, totalCents: 0 },
        totalCents: 0,
      })
      .returning()
    quoteId = quote!.id
    await new RealTradeService().create({ organizationId, slug: customTrade, name: 'Framing' })
  })

  afterAll(async () => {
    if (!organizationId) return
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, organizationId))
    await db.delete(workOrders).where(eq(workOrders.organizationId, organizationId))
    await db.delete(subcontractors).where(eq(subcontractors.organizationId, organizationId))
    await db.delete(trades).where(eq(trades.organizationId, organizationId))
    await db.delete(quotes).where(eq(quotes.organizationId, organizationId))
    await db.delete(properties).where(eq(properties.organizationId, organizationId))
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(organizations).where(eq(organizations.id, organizationId))
  })

  const workOrderInput = (trade: string) => ({
    organizationId,
    propertyId,
    quoteId,
    scheduledStart: null,
    scheduledEnd: null,
    tradeSlots: [{
      id: randomUUID(),
      trade,
      description: 'Framing work',
      status: 'unassigned' as const,
      assignedSubcontractorId: null,
      scheduledStart: null,
      scheduledEnd: null,
      notes: null,
    }],
    materials: [],
    notes: null,
    createdById: userId,
  })

  it('accepts active custom trades and rejects unknown slugs before persistence', async () => {
    const workOrderService = new RealWorkOrderService()
    const created = await workOrderService.create(workOrderInput(customTrade))
    expect(created.tradeSlots[0]?.trade).toBe(customTrade)

    const before = await workOrderService.list({ organizationId, page: 1, pageSize: 100 })
    await expect(workOrderService.create(workOrderInput('unknown_trade'))).rejects.toThrow(/invalid trade/i)
    const after = await workOrderService.list({ organizationId, page: 1, pageSize: 100 })
    expect(after.total).toBe(before.total)

    const subcontractorService = new RealSubcontractorService()
    const subcontractor = await subcontractorService.create({
      organizationId,
      companyName: 'Catalog Framing',
      contactName: 'Test Contact',
      email: null,
      phone: '555-0100',
      trades: [customTrade],
      licenseNumber: null,
      licenseExpiresAt: null,
      notes: null,
    })
    await expect(
      subcontractorService.update(subcontractor.id, { trades: ['unknown_trade'] }, organizationId),
    ).rejects.toThrow(/invalid trade/i)
    await expect(subcontractorService.get(subcontractor.id, organizationId)).resolves.toMatchObject({
      trades: [customTrade],
    })
  })

  it('rejects a cross-tenant work-order mutation before catalog lookup', async () => {
    const resolver = () => ({ userId, organizationId: '00000000-0000-4000-8000-000000000ccc' })
    const service = new RealWorkOrderService(resolver)
    await expect(service.create(workOrderInput(customTrade))).rejects.toBeInstanceOf(TenantViolationError)
  })
})
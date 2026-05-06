/**
 * tests/integration/work-order.real.test.ts — RealWorkOrderService (E11-S8).
 */
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
import { RealWorkOrderService } from '../../server/services/work-order.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealWorkOrderService (E11-S8)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string
  let userId: string
  let propertyId: string
  let quoteId: string

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'E11-S8 WO Org', slug: `e11s8w-${stamp}` }).returning()
    orgId = o!.id
    const [u] = await db.insert(users).values({ email: `e11s8w-${stamp}@x.test`, fullName: 'T', passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userId = u!.id
    const [p] = await db.insert(properties).values({ organizationId: orgId, addressLine1: 'W', city: 'C', state: 'CA', postalCode: '0' }).returning()
    propertyId = p!.id
    const [q] = await db.insert(quotes).values({
      organizationId: orgId, propertyId, assessmentId: null, createdById: userId,
      quoteNumber: `Q-FIX-${stamp}`, status: 'accepted',
      lineItems: [], markupPercent: 0, taxPercent: 0, notes: null,
      totals: { subtotalCents: 0, markupCents: 0, taxCents: 0, totalCents: 0 },
      totalCents: 0,
    }).returning()
    quoteId = q!.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(workOrders).where(eq(workOrders.organizationId, orgId))
    await db.delete(quotes).where(eq(quotes.organizationId, orgId))
    await db.delete(properties).where(eq(properties.organizationId, orgId))
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  const slotId = () => randomUUID()
  const baseInput = () => {
    const id = slotId()
    return {
      input: {
        organizationId: orgId,
        propertyId,
        quoteId,
        scheduledStart: null,
        scheduledEnd: null,
        tradeSlots: [
          { id, trade: 'roofing' as const, description: 'Tear off + reroof', status: 'unassigned' as const, assignedSubcontractorId: null, scheduledStart: null, scheduledEnd: null, notes: null },
        ],
        materials: [],
        notes: null,
        createdById: userId,
      },
      slotId: id,
    }
  }

  it('create() assigns WO-YYYY-#### number and persists slots', async () => {
    const svc = new RealWorkOrderService()
    const { input } = baseInput()
    const wo = await svc.create(input)
    expect(wo.workOrderNumber).toMatch(/^WO-\d{4}-\d{4}$/)
    expect(wo.tradeSlots).toHaveLength(1)
    expect(wo.status).toBe('draft')
  })

  it('assignTrade() auto-bumps slot status from unassigned to assigned', async () => {
    const svc = new RealWorkOrderService()
    const { input, slotId: sid } = baseInput()
    const wo = await svc.create(input)
    const subId = randomUUID()
    const after = await svc.assignTrade(wo.id, sid, subId, orgId)
    const slot = after.tradeSlots.find((s) => s.id === sid)!
    expect(slot.assignedSubcontractorId).toBe(subId)
    expect(slot.status).toBe('assigned')
    // Clear back to null → slot returns to unassigned.
    const cleared = await svc.assignTrade(wo.id, sid, null, orgId)
    const cs = cleared.tradeSlots.find((s) => s.id === sid)!
    expect(cs.assignedSubcontractorId).toBeNull()
    expect(cs.status).toBe('unassigned')
  })

  it('updateTradeStatus() writes an audit row with kind metadata', async () => {
    const svc = new RealWorkOrderService()
    const { input, slotId: sid } = baseInput()
    const wo = await svc.create(input)
    const after = await svc.updateTradeStatus(wo.id, sid, 'in_progress', orgId)
    expect(after.tradeSlots.find((s) => s.id === sid)!.status).toBe('in_progress')
    const db = getDb()
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, wo.id))
    const stateChange = rows.find((r) => r.action === 'state_change')
    expect(stateChange).toBeDefined()
    expect(stateChange!.metadata).toMatchObject({ kind: 'state_change', to: 'in_progress' })
  })

  it('tenant firewall blocks cross-tenant create', async () => {
    const resolver = () => ({ userId, organizationId: '00000000-0000-4000-8000-000000000ccc' })
    const svc = new RealWorkOrderService(resolver)
    const { input } = baseInput()
    await expect(svc.create(input)).rejects.toBeInstanceOf(TenantViolationError)
  })
})

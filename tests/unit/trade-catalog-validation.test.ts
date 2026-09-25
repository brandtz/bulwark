import { describe, expect, it } from 'vitest'
import { TradeSchema } from '../../shared/contracts/subcontractor'
import { TradeRecordSchema } from '../../shared/contracts/trade'
import { MockTradeService } from '../../shared/mocks/trade.mock'
import { MockWorkOrderService } from '../../shared/mocks/work-order.mock'
import { MockSubcontractorService, __resetSubcontractorMock } from '../../shared/mocks/subcontractor.mock'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2, FIXTURE_USER_ADMIN } from '../../shared/mocks/fixtures'
import { TenantViolationError, type TenantResolver } from '../../shared/mocks/tenant'

const resolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

function workOrderInput(trade: string) {
  return {
    organizationId: FIXTURE_ORG_ID,
    propertyId: 'property-catalog-test',
    quoteId: 'quote-catalog-test',
    scheduledStart: null,
    scheduledEnd: null,
    tradeSlots: [{
      id: 'slot-catalog-test',
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
    createdById: FIXTURE_USER_ADMIN.userId,
  }
}

describe('organization trade catalog validation', () => {
  it('accepts a custom slug in the shared trade contract', () => {
    expect(TradeSchema.parse('framing')).toBe('framing')
    expect(TradeSchema.parse('solar-install')).toBe('solar-install')
    expect(TradeSchema.safeParse('solar--install').success).toBe(false)
    expect(TradeSchema.safeParse('').success).toBe(false)
  })

  it('accepts documented kebab-case catalog slugs and rejects malformed separators', () => {
    expect(TradeRecordSchema.shape.slug.parse('solar-install')).toBe('solar-install')
    expect(TradeRecordSchema.shape.slug.parse('eaves_vents')).toBe('eaves_vents')
    expect(TradeRecordSchema.shape.slug.safeParse('-solar').success).toBe(false)
    expect(TradeRecordSchema.shape.slug.safeParse('solar--install').success).toBe(false)
  })

  it('accepts active catalog slugs and rejects unknown or inactive slugs', async () => {
    const trades = new MockTradeService(resolver)
    const slug = `framing_${Date.now()}`
    const created = await trades.create({
      organizationId: FIXTURE_ORG_ID,
      slug,
      name: 'Framing',
    })

    await expect(trades.assertActiveSlugs(FIXTURE_ORG_ID, [slug])).resolves.toBeUndefined()
    await expect(trades.assertActiveSlugs(FIXTURE_ORG_ID, ['unknown_trade'])).rejects.toThrow(/invalid trade/i)
    await trades.update({ id: created.id, organizationId: FIXTURE_ORG_ID, isActive: false })
    await expect(trades.assertActiveSlugs(FIXTURE_ORG_ID, [slug])).rejects.toThrow(/invalid trade/i)
  })

  it('retains the tenant firewall on catalog validation', async () => {
    const trades = new MockTradeService(resolver)
    await expect(trades.assertActiveSlugs(FIXTURE_ORG_ID_2, ['roofing'])).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('validates work-order slots and does not persist an unknown trade', async () => {
    const catalog = new MockTradeService(resolver)
    const slug = `framing_${Date.now()}`
    await catalog.create({ organizationId: FIXTURE_ORG_ID, slug, name: 'Framing' })
    const workOrders = new MockWorkOrderService(resolver)

    await expect(workOrders.create(workOrderInput(slug))).resolves.toMatchObject({
      tradeSlots: [expect.objectContaining({ trade: slug })],
    })
    const before = await workOrders.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 100 })
    await expect(workOrders.create(workOrderInput('unknown_trade'))).rejects.toThrow(/invalid trade/i)
    const after = await workOrders.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 100 })
    expect(after.total).toBe(before.total)
  })

  it('validates subcontractor trade lists on create and update', async () => {
    __resetSubcontractorMock()
    const catalog = new MockTradeService(resolver)
    const slug = `framing_${Date.now()}`
    await catalog.create({ organizationId: FIXTURE_ORG_ID, slug, name: 'Framing' })
    const subcontractors = new MockSubcontractorService(resolver)
    const created = await subcontractors.create({
      organizationId: FIXTURE_ORG_ID,
      companyName: 'Catalog Test Framing',
      contactName: 'Test Contact',
      email: null,
      phone: '555-0100',
      trades: [slug],
      licenseNumber: null,
      licenseExpiresAt: null,
      notes: null,
    })

    await expect(subcontractors.update(created.id, { trades: ['unknown_trade'] }, FIXTURE_ORG_ID)).rejects.toThrow(/invalid trade/i)
    await expect(subcontractors.get(created.id, FIXTURE_ORG_ID)).resolves.toMatchObject({ trades: [slug] })
    __resetSubcontractorMock()
  })
})
/**
 * tests/unit/trades.test.ts — Wave 1B / EH-H / W1-3 acceptance.
 */
import { describe, it, expect } from 'vitest'
import { MockTradeService } from '~~/shared/mocks/trade.mock'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2, FIXTURE_USER_ADMIN } from '~~/shared/mocks/fixtures'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'

const orgResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

describe('MockTradeService (Wave 1B / EH-H / W1-3)', () => {
  it('seeds the 6 builtin trades for the active org', async () => {
    const svc = new MockTradeService(orgResolver)
    const out = await svc.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 50 })
    const slugs = out.rows.map((r) => r.slug)
    for (const expected of [
      'roofing',
      'siding',
      'gutters',
      'eaves_vents',
      'defensible_space',
      'general_labor',
    ]) {
      expect(slugs).toContain(expected)
    }
  })

  it('builtin trades reject soft-delete', async () => {
    const svc = new MockTradeService(orgResolver)
    const out = await svc.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 50 })
    const roofing = out.rows.find((r) => r.slug === 'roofing')!
    await expect(svc.softDelete(roofing.id, FIXTURE_ORG_ID)).rejects.toThrow(/built-in/i)
  })

  it('rejects duplicate slug within the same org', async () => {
    const svc = new MockTradeService(orgResolver)
    await expect(
      svc.create({ organizationId: FIXTURE_ORG_ID, slug: 'roofing', name: 'Custom roofing' }),
    ).rejects.toThrow(/slug/i)
  })

  it('allows custom trade creation and soft-delete', async () => {
    const svc = new MockTradeService(orgResolver)
    const created = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      slug: 'framing',
      name: 'Framing',
    })
    expect(created.isBuiltin).toBe(false)
    await svc.softDelete(created.id, FIXTURE_ORG_ID)
    const out = await svc.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 200 })
    expect(out.rows.find((r) => r.id === created.id)).toBeUndefined()
  })

  it('rejects cross-tenant list', async () => {
    const svc = new MockTradeService(orgResolver)
    await expect(
      svc.list({ organizationId: FIXTURE_ORG_ID_2, page: 1, pageSize: 5 }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })
})

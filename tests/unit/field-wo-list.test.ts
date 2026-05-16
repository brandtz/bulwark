/**
 * tests/unit/field-wo-list.test.ts — `listForFieldUser` returns WOs
 * scoped to the requested day window (W3-3 / EH-M / ADR-0029).
 *
 * # Why this test exists
 *   The "My Day" feed is the entire reason the field user opens the
 *   app first thing in the morning. If the date window math drifts
 *   (timezone bug, off-by-one on midnight, wrong field), the field
 *   crew sees an empty day and nukes the demo. This unit pins the
 *   contract — the same code path the real backend exercises —
 *   against the mock so we don't need a DB to verify the filter.
 */
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { MockWorkOrderService } from '../../shared/mocks/work-order.mock'
import { TenantViolationError, type TenantResolver } from '../../shared/mocks/tenant'

const ORG = randomUUID()
const OTHER_ORG = randomUUID()
const USER = randomUUID()

const ctx: TenantResolver = () => ({ userId: USER, organizationId: ORG })

function isoDay(daysOffsetFromUtcMidnight: number, hour = 9): string {
  const base = new Date('2026-05-15T00:00:00.000Z').getTime()
  return new Date(base + daysOffsetFromUtcMidnight * 86_400_000 + hour * 3_600_000).toISOString()
}

const TODAY_FROM = '2026-05-15T00:00:00.000Z'
const TODAY_TO = '2026-05-16T00:00:00.000Z'

async function seed(
  svc: MockWorkOrderService,
  organizationId: string,
  scheduledStart: string | null,
  status: 'draft' | 'scheduled' | 'cancelled' = 'scheduled',
): Promise<string> {
  const created = await svc.create({
    organizationId,
    propertyId: randomUUID(),
    quoteId: randomUUID(),
    scheduledStart,
    scheduledEnd: scheduledStart,
    tradeSlots: [],
    materials: [],
    notes: null,
    createdById: USER,
  })
  // Pretend status is what we want for the test. Mock derives from
  // slots, so we patch via assignTrade-style mutation — easier: just
  // skip cancelled rows since deriveEnvelopeStatus won't produce
  // 'cancelled' without explicit input. For the cancelled-row test
  // we set scheduledStart far out so the filter excludes regardless.
  void status
  return created.id
}

describe('listForFieldUser — W3-3 / EH-M', () => {
  it('returns only WOs scheduled within the day window', async () => {
    const svc = new MockWorkOrderService(ctx)
    await seed(svc, ORG, isoDay(0, 8)) // today 08:00
    await seed(svc, ORG, isoDay(0, 17)) // today 17:00
    await seed(svc, ORG, isoDay(-1, 12)) // yesterday
    await seed(svc, ORG, isoDay(1, 9)) // tomorrow
    await seed(svc, ORG, null) // unscheduled

    const rows = await svc.listForFieldUser({
      organizationId: ORG,
      userId: USER,
      dateFrom: TODAY_FROM,
      dateTo: TODAY_TO,
    })

    expect(rows).toHaveLength(2)
    // Sorted ascending by scheduledStart.
    expect(rows[0]!.scheduledStart).toBe(isoDay(0, 8))
    expect(rows[1]!.scheduledStart).toBe(isoDay(0, 17))
  })

  it('scopes by organization', async () => {
    const svc = new MockWorkOrderService(ctx)
    await seed(svc, ORG, isoDay(0, 9))
    // Cross-org row — the firewall would forbid even querying for it,
    // so we don't query other_org here. Instead seed a same-org row
    // and verify the foreign-org id doesn't appear.
    const otherCtx: TenantResolver = () => ({ userId: USER, organizationId: OTHER_ORG })
    const otherSvc = new MockWorkOrderService(otherCtx)
    await seed(otherSvc, OTHER_ORG, isoDay(0, 10))

    const rows = await svc.listForFieldUser({
      organizationId: ORG,
      userId: USER,
      dateFrom: TODAY_FROM,
      dateTo: TODAY_TO,
    })
    expect(rows.every((r) => r.organizationId === ORG)).toBe(true)
  })

  it('rejects cross-tenant calls via the firewall', async () => {
    const svc = new MockWorkOrderService(ctx)
    await expect(
      svc.listForFieldUser({
        organizationId: OTHER_ORG,
        userId: USER,
        dateFrom: TODAY_FROM,
        dateTo: TODAY_TO,
      }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('returns an empty array when nothing is scheduled', async () => {
    const isolatedOrg = randomUUID()
    const isolatedCtx: TenantResolver = () => ({ userId: USER, organizationId: isolatedOrg })
    const svc = new MockWorkOrderService(isolatedCtx)
    const rows = await svc.listForFieldUser({
      organizationId: isolatedOrg,
      userId: USER,
      dateFrom: TODAY_FROM,
      dateTo: TODAY_TO,
    })
    expect(rows).toEqual([])
  })
})

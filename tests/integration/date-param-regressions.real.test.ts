/**
 * Regressions found by the WP-L07 full e2e sweep (2026-09-27): two real-backend
 * queries crashed on every call.
 *   - reporting.revenueTrend bound date_trunc's unit as separate parameters in
 *     SELECT/GROUP BY/ORDER BY ("must appear in the GROUP BY clause").
 *   - workOrder.listForFieldUser passed a Date into a raw sql`` fragment, which
 *     postgres-js rejects (/api/field/my-day 500).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb } from '../../server/db/client'
import { organizations } from '../../server/db/schema/organizations'
import { RealReportingService } from '../../server/services/reporting.real'
import { RealWorkOrderService } from '../../server/services/work-order.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('date parameter regressions', () => {
  let organizationId = ''
  const range = { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' }

  beforeAll(async () => {
    const [org] = await getDb().insert(organizations).values({ name: 'Date Regressions', slug: `date-reg-${randomUUID()}` }).returning()
    organizationId = org!.id
  })

  afterAll(async () => {
    if (organizationId) await getDb().delete(organizations).where(eq(organizations.id, organizationId))
  })

  it('revenueTrend groups by every supported granularity', async () => {
    const svc = new RealReportingService()
    for (const granularity of ['day', 'week', 'month'] as const) {
      await expect(svc.revenueTrend({ organizationId, range, granularity })).resolves.toBeDefined()
    }
  })

  it('revenueTrend refuses a granularity outside the whitelist (no SQL injection via sql.raw)', async () => {
    const svc = new RealReportingService()
    await expect(svc.revenueTrend({ organizationId, range, granularity: "day', now()) --" as never })).rejects.toThrow(/Invalid granularity/u)
  })

  it('listForFieldUser accepts a date window', async () => {
    const svc = new RealWorkOrderService()
    await expect(svc.listForFieldUser({ organizationId, userId: randomUUID(), dateFrom: range.from, dateTo: range.to })).resolves.toEqual([])
  })
})

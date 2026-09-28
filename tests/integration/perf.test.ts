/**
 * tests/integration/perf.test.ts — WP-L08 (epic L10-S2) service latency budget.
 *
 * Seeds one org with a realistic list volume (properties + quotes), then times
 * the primary list / filtered list / search / cursor / detail calls through the
 * real services and asserts each p95 stays under budget. Prints a table so a
 * regression shows which call moved. Needs Postgres (skips without
 * DATABASE_URL); budgets are for a local/CI database, not a remote one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { auditLog, organizations, properties, quotes, users } from '../../server/db/schema'
import { RealPropertyService } from '../../server/services/property.real'
import { RealQuoteService } from '../../server/services/quote.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

const N_PROPERTIES = 400
const N_QUOTES = 400
const RUNS = 25
/** p95 budget per call, ms (L10: primary endpoints; the HTTP p95 budget is 1500 ms). */
const BUDGET_MS = 200

async function time(fn: () => Promise<unknown>): Promise<{ p50: number, p95: number }> {
  await fn() // warm the plan cache / pool
  const samples: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now()
    await fn()
    samples.push(performance.now() - t)
  }
  samples.sort((a, b) => a - b)
  const at = (p: number) => samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)]!
  return { p50: at(0.5), p95: at(0.95) }
}

d('service latency budget (WP-L08 / L10-S2)', () => {
  let orgId: string
  let userId: string
  let somePropertyId: string

  beforeAll(async () => {
    const db = getDb()
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const [o] = await db.insert(organizations).values({ name: 'L10 perf', slug: `l10-perf-${stamp}` }).returning()
    orgId = o!.id
    const [u] = await db.insert(users).values({ email: `l10-${stamp}@x.test`, fullName: 'P', passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userId = u!.id
    const statuses = ['lead', 'assessed', 'quoted', 'in_progress', 'complete']
    const props = await db.insert(properties).values(Array.from({ length: N_PROPERTIES }, (_, i) => ({
      organizationId: orgId,
      addressLine1: `${i} Perf Street`,
      city: i % 2 ? 'Santa Rosa' : 'Napa',
      state: 'CA',
      postalCode: '95400',
      status: statuses[i % statuses.length]!,
    }))).returning({ id: properties.id })
    somePropertyId = props[0]!.id
    const total = { subtotalCents: 1000, markupCents: 0, taxCents: 0, totalCents: 1000 }
    await db.insert(quotes).values(Array.from({ length: N_QUOTES }, (_, i) => ({
      organizationId: orgId,
      propertyId: props[i % props.length]!.id,
      createdById: userId,
      quoteNumber: `PERF-${i}`,
      status: (['draft', 'sent', 'accepted'] as const)[i % 3],
      lineItems: [],
      totals: total,
      totalCents: 1000,
    })) as never)
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(inArray(auditLog.organizationId, [orgId]))
    await db.delete(quotes).where(inArray(quotes.organizationId, [orgId]))
    await db.delete(properties).where(inArray(properties.organizationId, [orgId]))
    await db.delete(users).where(inArray(users.id, [userId]))
    await db.delete(organizations).where(inArray(organizations.id, [orgId]))
  })

  it(`primary reads stay under ${BUDGET_MS} ms p95`, async () => {
    const props = new RealPropertyService()
    const q = new RealQuoteService()
    const firstPage = await props.list({ organizationId: orgId, page: 1, pageSize: 50 })
    const cursor = firstPage.nextCursor!

    const results: Record<string, { p50: number, p95: number }> = {
      'property.list (page 1)': await time(() => props.list({ organizationId: orgId, page: 1, pageSize: 50 })),
      'property.list (page 8)': await time(() => props.list({ organizationId: orgId, page: 8, pageSize: 50 })),
      'property.list (cursor)': await time(() => props.list({ organizationId: orgId, page: 1, pageSize: 50, ...cursor })),
      'property.list (status)': await time(() => props.list({ organizationId: orgId, page: 1, pageSize: 50, status: 'quoted' })),
      'property.list (search)': await time(() => props.list({ organizationId: orgId, page: 1, pageSize: 50, search: 'Perf' })),
      'property.getWithDepth': await time(() => props.getWithDepth(somePropertyId, orgId)),
      'quote.list (page 1)': await time(() => q.list({ organizationId: orgId, page: 1, pageSize: 50 })),
      'quote.list (status)': await time(() => q.list({ organizationId: orgId, page: 1, pageSize: 50, status: 'sent' })),
      'quote.list (by property)': await time(() => q.list({ organizationId: orgId, page: 1, pageSize: 50, propertyId: somePropertyId })),
    }
    console.table(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { p50: v.p50.toFixed(1), p95: v.p95.toFixed(1) }])))
    const over = Object.entries(results).filter(([, v]) => v.p95 > BUDGET_MS).map(([k, v]) => `${k}: p95 ${v.p95.toFixed(1)} ms`)
    expect(over, over.join('\n')).toEqual([])
  })
})

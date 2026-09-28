/**
 * tests/integration/pagination-cursor.test.ts — WP-L06 S3 against Postgres.
 *
 * Seeds properties whose created_at values share milliseconds and carry
 * sub-millisecond digits (what now() produces), then walks
 * RealPropertyService.list by cursor: every row exactly once, same order as
 * the offset path, and the offset cap is enforced server-side.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { organizations, properties } from '../../server/db/schema'
import { RealPropertyService } from '../../server/services/property.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip
const N = 23

d('cursor pagination on a real list (WP-L06 S3)', () => {
  let orgId: string

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'L06 cursor', slug: `l06-cursor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }).returning()
    orgId = o!.id
    const base = Date.UTC(2026, 2, 1)
    await db.insert(properties).values(Array.from({ length: N }, (_, i) => ({
      organizationId: orgId,
      addressLine1: `${i} Cursor Way`,
      city: 'C',
      state: 'CA',
      postalCode: '0',
      // Groups of 3 share one millisecond, each with distinct microseconds.
      createdAt: sql`${new Date(base + Math.floor(i / 3)).toISOString()}::timestamptz + make_interval(secs => ${(i % 3) * 0.0001})`,
    })) as never)
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(properties).where(eq(properties.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  it('walks every row exactly once, matching the offset order', async () => {
    const svc = new RealPropertyService()
    const offsetAll = await svc.list({ organizationId: orgId, page: 1, pageSize: 100 })
    expect(offsetAll.rows).toHaveLength(N)

    const seen: string[] = []
    let cursor: { afterCreatedAt: string, afterId: string } | null | undefined
    let pages = 0
    do {
      const page = await svc.list({ organizationId: orgId, page: 1, pageSize: 5, ...(cursor ?? {}) })
      if (page.nextCursor) expect(page.nextCursor.afterCreatedAt).toMatch(/\.\d{6}Z$/) // exact µs, not the row's ms
      expect(page.total).toBe(N)
      seen.push(...page.rows.map((r) => r.id))
      cursor = page.nextCursor
      pages++
    } while (cursor && pages < 20)

    expect(new Set(seen).size).toBe(N)
    expect(seen).toHaveLength(N)
    expect(pages).toBe(5)
    // Cursor and offset share one (created_at, id) order, even inside a shared millisecond.
    expect(seen).toEqual(offsetAll.rows.map((r) => r.id))
  })

  it('rejects an unbounded offset page', async () => {
    const svc = new RealPropertyService()
    await expect(svc.list({ organizationId: orgId, page: 1001, pageSize: 5 })).rejects.toThrow(/^Invalid pagination/)
  })
})

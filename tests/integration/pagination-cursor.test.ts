/**
 * tests/integration/pagination-cursor.test.ts — WP-L06 S3 against Postgres.
 *
 * Seeds properties whose created_at values share milliseconds and carry
 * sub-millisecond digits (what now() produces), then walks
 * RealPropertyService.list by cursor: every row exactly once, same order as
 * the offset path, and the offset cap is enforced server-side. The second
 * block does the same for the other cursor lists (quote, invoice, work
 * order, audit filter, notifications) and the audit CSV export's page walk.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { auditLog, invoices, notifications, organizations, properties, quotes, users, workOrders } from '../../server/db/schema'
import { RealPropertyService } from '../../server/services/property.real'
import { RealQuoteService } from '../../server/services/quote.real'
import { RealInvoiceService } from '../../server/services/invoice.real'
import { RealWorkOrderService } from '../../server/services/work-order.real'
import { RealAuditService } from '../../server/services/audit.real'
import { RealNotificationService } from '../../server/services/notification.real'

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

// Created-at for row i: groups of 3 share one millisecond, with distinct
// microseconds, so a millisecond-precision cursor would repeat or skip rows.
const sharedMs = (i: number) => sql`${new Date(Date.UTC(2026, 2, 1) + Math.floor(i / 3)).toISOString()}::timestamptz + make_interval(secs => ${(i % 3) * 0.0001})`

type Cursor = { afterCreatedAt: string, afterId: string }
async function walk(read: (cursor: Cursor | undefined) => Promise<{ rows: { id: string }[], nextCursor?: Cursor | null }>): Promise<string[]> {
  const seen: string[] = []
  let cursor: Cursor | null | undefined
  let pages = 0
  do {
    const page = await read(cursor ?? undefined)
    if (page.nextCursor) expect(page.nextCursor.afterCreatedAt).toMatch(/\.\d{6}Z$/)
    seen.push(...page.rows.map((r) => r.id))
    cursor = page.nextCursor
    pages++
  } while (cursor && pages < 50)
  return seen
}

d('cursor pagination on every keyset list (WP-L06 S3)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  let orgId: string
  let userId: string
  let propertyId: string
  const AUDIT_ROWS = 1003 // crosses the export's 1000-row page

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'L06 cursor lists', slug: `l06-lists-${stamp}` }).returning()
    orgId = o!.id
    const [u] = await db.insert(users).values({ email: `l06-lists-${stamp}@x.test`, fullName: 'T', passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userId = u!.id
    const [p] = await db.insert(properties).values({ organizationId: orgId, addressLine1: '1 List Way', city: 'C', state: 'CA', postalCode: '0' }).returning()
    propertyId = p!.id
    const totals = { subtotalCents: 0, markupCents: 0, taxCents: 0, totalCents: 0 }
    const qs = await db.insert(quotes).values(Array.from({ length: N }, (_, i) => ({
      organizationId: orgId, propertyId, createdById: userId, lineItems: [], totals, quoteNumber: `LQ-${i}`, createdAt: sharedMs(i),
    })) as never).returning()
    await db.insert(invoices).values(Array.from({ length: N }, (_, i) => ({
      organizationId: orgId, propertyId, invoiceNumber: `LI-${i}`, lineItems: [], totals, createdAt: sharedMs(i),
    })) as never)
    await db.insert(workOrders).values(Array.from({ length: N }, (_, i) => ({
      organizationId: orgId, propertyId, quoteId: qs[0]!.id, workOrderNumber: `LW-${i}`, tradeSlots: [], materials: [], createdById: userId, createdAt: sharedMs(i),
    })) as never)
    await db.insert(notifications).values(Array.from({ length: N }, (_, i) => ({
      organizationId: orgId, userId, eventType: 'l06.test', title: `n${i}`, body: 'b', createdAt: sharedMs(i),
    })) as never)
    await db.insert(auditLog).values(Array.from({ length: AUDIT_ROWS }, (_, i) => ({
      organizationId: orgId, entityType: 'l06_test', entityId: propertyId, action: 'update', createdAt: sharedMs(i),
    })) as never)
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(notifications).where(eq(notifications.organizationId, orgId))
    await db.delete(workOrders).where(eq(workOrders.organizationId, orgId))
    await db.delete(invoices).where(eq(invoices.organizationId, orgId))
    await db.delete(quotes).where(eq(quotes.organizationId, orgId))
    await db.delete(properties).where(eq(properties.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await db.delete(users).where(eq(users.id, userId))
  })

  const lists: [string, (c: Cursor | undefined, pageSize: number) => Promise<{ rows: { id: string }[], nextCursor?: Cursor | null }>][] = [
    ['quote.list', (c, pageSize) => new RealQuoteService().list({ organizationId: orgId, page: 1, pageSize, ...c })],
    ['invoice.list', (c, pageSize) => new RealInvoiceService().list({ organizationId: orgId, page: 1, pageSize, ...c })],
    ['workOrder.list', (c, pageSize) => new RealWorkOrderService().list({ organizationId: orgId, page: 1, pageSize, ...c })],
    ['audit.filter', (c, pageSize) => new RealAuditService().filter({ organizationId: orgId, entityType: 'l06_test', page: 1, pageSize, ...c })],
    ['notification.listForUser', (c, pageSize) =>
      new RealNotificationService(() => ({ userId, organizationId: orgId })).listForUser(userId, { page: 1, pageSize, ...c })],
  ]

  for (const [name, read] of lists) {
    it(`${name} walks every row exactly once, in offset order`, async () => {
      const offsetAll = await read(undefined, 1000)
      const expected = offsetAll.rows.map((r) => r.id)
      expect(expected.length).toBeGreaterThanOrEqual(N)
      const seen = await walk((c) => read(c, 7))
      expect(new Set(seen).size).toBe(seen.length)
      expect(seen).toEqual(expected.slice(0, seen.length))
      if (name !== 'audit.filter') expect(seen).toHaveLength(N)
    })
  }

  it('audit.exportCsv walks past its page size without repeating or dropping rows', async () => {
    const csv = await new RealAuditService().exportCsv({ organizationId: orgId, entityType: 'l06_test' })
    const ids = csv.trim().split(/\r?\n/).slice(1).map((line) => line.split(',')[0]!.replace(/"/g, ''))
    expect(ids).toHaveLength(AUDIT_ROWS)
    expect(new Set(ids).size).toBe(AUDIT_ROWS)
  })
})

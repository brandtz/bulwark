/**
 * WP-L07 S7 — homeowner self-scoped portal reads. A homeowner sees only the
 * properties they belong to, and only quotes/invoices on those properties that
 * have left draft. Other homeowners' records and internal drafts stay hidden,
 * and the caller's identity always comes from the session.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb } from '../../server/db/client'
import { users } from '../../server/db/schema/users'
import { organizations } from '../../server/db/schema/organizations'
import { properties } from '../../server/db/schema/properties'
import { quotes } from '../../server/db/schema/quotes'
import { invoices } from '../../server/db/schema/invoices'
import { homeownerUsers } from '../../server/db/schema/homeowner_users'
import { RealHomeownerService } from '../../server/services/homeowner.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealHomeownerService portal reads', () => {
  const tag = randomUUID().slice(0, 8)
  const ids = { org: '', otherOrg: '', ownerA: '', ownerB: '', staff: '', propA: '', propB: '' }
  const q = { aSent: '', aDraft: '', bSent: '' }
  const inv = { aSent: '', aDraft: '', bSent: '' }
  const zero = { subtotalCents: 0, markupCents: 0, taxCents: 0, totalCents: 0 }

  beforeAll(async () => {
    const db = getDb()
    const [org, other] = await db.insert(organizations).values([
      { name: 'Portal Test', slug: `portal-${tag}` },
      { name: 'Portal Other', slug: `portal-other-${tag}` },
    ]).returning()
    ids.org = org!.id
    ids.otherOrg = other!.id
    const [a, b, staff] = await db.insert(users).values([
      { email: `portal-a-${tag}@example.test`, fullName: 'Owner A' },
      { email: `portal-b-${tag}@example.test`, fullName: 'Owner B' },
      { email: `portal-staff-${tag}@example.test`, fullName: 'Staff' },
    ]).returning()
    ids.ownerA = a!.id
    ids.ownerB = b!.id
    ids.staff = staff!.id
    const [pa, pb] = await db.insert(properties).values([
      { organizationId: ids.org, addressLine1: '1 Owner A Way', city: 'C', state: 'CA', postalCode: '1' },
      { organizationId: ids.org, addressLine1: '2 Owner B Way', city: 'C', state: 'CA', postalCode: '2' },
    ]).returning()
    ids.propA = pa!.id
    ids.propB = pb!.id
    await db.insert(homeownerUsers).values([
      { organizationId: ids.org, propertyId: ids.propA, userId: ids.ownerA },
      { organizationId: ids.org, propertyId: ids.propB, userId: ids.ownerB },
    ])
    const quoteBase = { organizationId: ids.org, createdById: ids.staff, lineItems: [], markupPercent: 0, taxPercent: 0, totals: zero, totalCents: 0 }
    const qs = await db.insert(quotes).values([
      { ...quoteBase, propertyId: ids.propA, quoteNumber: `Q-${tag}-A1`, status: 'sent' },
      { ...quoteBase, propertyId: ids.propA, quoteNumber: `Q-${tag}-A2`, status: 'draft' },
      { ...quoteBase, propertyId: ids.propB, quoteNumber: `Q-${tag}-B1`, status: 'sent' },
    ]).returning()
    ;[q.aSent, q.aDraft, q.bSent] = qs.map((r) => r.id) as [string, string, string]
    const invBase = { organizationId: ids.org, lineItems: [], markupPercent: 0, taxPercent: 0, totals: zero, totalCents: 0 }
    const is = await db.insert(invoices).values([
      { ...invBase, propertyId: ids.propA, invoiceNumber: `INV-${tag}-A1`, status: 'sent' },
      { ...invBase, propertyId: ids.propA, invoiceNumber: `INV-${tag}-A2`, status: 'draft' },
      { ...invBase, propertyId: ids.propB, invoiceNumber: `INV-${tag}-B1`, status: 'sent' },
    ]).returning()
    ;[inv.aSent, inv.aDraft, inv.bSent] = is.map((r) => r.id) as [string, string, string]
  })

  afterAll(async () => {
    if (!ids.org) return
    const db = getDb()
    const orgs = [ids.org, ids.otherOrg]
    await db.delete(invoices).where(inArray(invoices.organizationId, orgs))
    await db.delete(quotes).where(inArray(quotes.organizationId, orgs))
    await db.delete(homeownerUsers).where(inArray(homeownerUsers.organizationId, orgs))
    await db.delete(properties).where(inArray(properties.organizationId, orgs))
    await db.delete(users).where(inArray(users.id, [ids.ownerA, ids.ownerB, ids.staff]))
    await db.delete(organizations).where(inArray(organizations.id, orgs))
  })

  const asOwnerA = () => new RealHomeownerService(() => ({ userId: ids.ownerA, organizationId: ids.org }))

  it('lists only the caller\'s properties', async () => {
    const rows = await asOwnerA().listMyProperties(ids.org)
    expect(rows.map((r) => r.id)).toEqual([ids.propA])
  })

  it('lists only sent-or-later quotes on the caller\'s properties', async () => {
    const rows = await asOwnerA().listMyQuotes(ids.org)
    expect(rows.map((r) => r.id)).toEqual([q.aSent])
  })

  it('returns null for another homeowner\'s quote and for internal drafts', async () => {
    const svc = asOwnerA()
    await expect(svc.getMyQuote(q.aSent, ids.org)).resolves.toMatchObject({ id: q.aSent })
    await expect(svc.getMyQuote(q.bSent, ids.org)).resolves.toBeNull()
    await expect(svc.getMyQuote(q.aDraft, ids.org)).resolves.toBeNull()
  })

  it('scopes invoices the same way', async () => {
    const svc = asOwnerA()
    expect((await svc.listMyInvoices(ids.org)).map((r) => r.id)).toEqual([inv.aSent])
    await expect(svc.getMyInvoice(inv.aSent, ids.org)).resolves.toMatchObject({ id: inv.aSent })
    await expect(svc.getMyInvoice(inv.bSent, ids.org)).resolves.toBeNull()
    await expect(svc.getMyInvoice(inv.aDraft, ids.org)).resolves.toBeNull()
  })

  it('rejects another tenant and an unauthenticated caller', async () => {
    await expect(asOwnerA().listMyQuotes(ids.otherOrg)).rejects.toBeInstanceOf(TenantViolationError)
    await expect(new RealHomeownerService(() => null).listMyQuotes(ids.org)).rejects.toThrow(/Authentication required/u)
  })
})

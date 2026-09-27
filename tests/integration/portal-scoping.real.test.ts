/**
 * WP-L07 S7 — subcontractor portal self-binding (ED-054) and server-derived
 * audit actors. A sub user acts only as themselves / their own company, sees
 * only quotes on properties where their company holds a slot, and cannot
 * answer other quotes; forged "invited by" ids are ignored.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb } from '../../server/db/client'
import { memberships, users } from '../../server/db/schema/users'
import { organizations } from '../../server/db/schema/organizations'
import { properties } from '../../server/db/schema/properties'
import { quotes } from '../../server/db/schema/quotes'
import { workOrders } from '../../server/db/schema/work_orders'
import { subcontractors } from '../../server/db/schema/subcontractors'
import { subcontractorUsers } from '../../server/db/schema/subcontractor_users'
import { pendingInvites } from '../../server/db/schema/pending_invites'
import { auditLog } from '../../server/db/schema/audit_log'
import { RealSubcontractorService } from '../../server/services/subcontractor.real'
import { RealQuoteService } from '../../server/services/quote.real'
import { RealUserService } from '../../server/services/user.real'
import { ForbiddenError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('portal scoping (subcontractor self-binding, ED-054)', () => {
  const tag = randomUUID().slice(0, 8)
  const id = { org: '', admin: '', subUserA: '', subUserB: '', subA: '', subB: '', propA: '', propOther: '', quoteA: '', quoteOther: '', wo: '' }
  const zero = { subtotalCents: 0, markupCents: 0, taxCents: 0, totalCents: 0 }

  beforeAll(async () => {
    const db = getDb()
    const [org] = await db.insert(organizations).values({ name: 'Scoping Test', slug: `scoping-${tag}` }).returning()
    id.org = org!.id
    const [admin, ua, ub] = await db.insert(users).values([
      { email: `scope-admin-${tag}@example.test`, fullName: 'Admin' },
      { email: `scope-sub-a-${tag}@example.test`, fullName: 'Sub A User' },
      { email: `scope-sub-b-${tag}@example.test`, fullName: 'Sub B User' },
    ]).returning()
    ;[id.admin, id.subUserA, id.subUserB] = [admin!.id, ua!.id, ub!.id]
    await db.insert(memberships).values([
      { userId: id.admin, organizationId: id.org, role: 'org_admin' },
      { userId: id.subUserA, organizationId: id.org, role: 'sub_contractor' },
      { userId: id.subUserB, organizationId: id.org, role: 'sub_contractor' },
    ])
    const [sa, sb] = await db.insert(subcontractors).values([
      { organizationId: id.org, companyName: 'Sub A Co', contactName: 'A', phone: '1', trades: [] },
      { organizationId: id.org, companyName: 'Sub B Co', contactName: 'B', phone: '2', trades: [] },
    ]).returning()
    ;[id.subA, id.subB] = [sa!.id, sb!.id]
    await db.insert(subcontractorUsers).values([
      { organizationId: id.org, subcontractorId: id.subA, userId: id.subUserA },
      { organizationId: id.org, subcontractorId: id.subB, userId: id.subUserB },
    ])
    const [pa, po] = await db.insert(properties).values([
      { organizationId: id.org, addressLine1: '1 Assigned St', city: 'C', state: 'CA', postalCode: '1' },
      { organizationId: id.org, addressLine1: '2 Other St', city: 'C', state: 'CA', postalCode: '2' },
    ]).returning()
    ;[id.propA, id.propOther] = [pa!.id, po!.id]
    const quoteBase = { organizationId: id.org, createdById: id.admin, lineItems: [], markupPercent: 0, taxPercent: 0, totals: zero, totalCents: 0, status: 'sent' as const }
    const [qa, qo] = await db.insert(quotes).values([
      { ...quoteBase, propertyId: id.propA, quoteNumber: `Q-${tag}-A` },
      { ...quoteBase, propertyId: id.propOther, quoteNumber: `Q-${tag}-O` },
    ]).returning()
    ;[id.quoteA, id.quoteOther] = [qa!.id, qo!.id]
    const [wo] = await db.insert(workOrders).values({
      organizationId: id.org, propertyId: id.propA, quoteId: id.quoteA, workOrderNumber: `WO-${tag}`, createdById: id.admin, materials: [],
      tradeSlots: [{ id: randomUUID(), trade: 'roofing', description: 'Roof', status: 'assigned', assignedSubcontractorId: id.subA, scheduledStart: null, scheduledEnd: null, notes: null }],
    } as unknown as typeof workOrders.$inferInsert).returning()
    id.wo = wo!.id
  })

  afterAll(async () => {
    if (!id.org) return
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, id.org))
    await db.delete(pendingInvites).where(eq(pendingInvites.organizationId, id.org))
    await db.delete(workOrders).where(eq(workOrders.organizationId, id.org))
    await db.delete(quotes).where(eq(quotes.organizationId, id.org))
    await db.delete(properties).where(eq(properties.organizationId, id.org))
    await db.delete(subcontractorUsers).where(eq(subcontractorUsers.organizationId, id.org))
    await db.delete(subcontractors).where(eq(subcontractors.organizationId, id.org))
    await db.delete(memberships).where(eq(memberships.organizationId, id.org))
    await db.delete(users).where(inArray(users.id, [id.admin, id.subUserA, id.subUserB]))
    await db.delete(organizations).where(eq(organizations.id, id.org))
  })

  const as = (userId: string) => () => ({ userId, organizationId: id.org })

  it('lets a sub user act only as themselves', async () => {
    const svc = new RealSubcontractorService(as(id.subUserA))
    await expect(svc.resolveSubForUser(id.subUserA, id.org)).resolves.toEqual({ subcontractorId: id.subA })
    await expect(svc.resolveSubForUser(id.subUserB, id.org)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(svc.listMyAssignments(id.subUserB, id.org)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(svc.listMyQuotesRequested(id.subUserB, id.org)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('lets a sub user touch only their own company', async () => {
    const svc = new RealSubcontractorService(as(id.subUserA))
    await expect(svc.listCois(id.subA, id.org)).resolves.toEqual([])
    await expect(svc.listCois(id.subB, id.org)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(svc.listUsers(id.subB, id.org)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(svc.uploadCoi({ organizationId: id.org, subcontractorId: id.subB, fileUrl: 'uploads/coi.pdf', expiresAt: new Date(Date.now() + 86_400_000).toISOString() } as Parameters<typeof svc.uploadCoi>[0]))
      .rejects.toBeInstanceOf(ForbiddenError)
    // Org admins keep full access.
    await expect(new RealSubcontractorService(as(id.admin)).listCois(id.subB, id.org)).resolves.toEqual([])
  })

  it('shows a sub only quotes on properties where it holds a slot', async () => {
    const rows = await new RealSubcontractorService(as(id.subUserA)).listMyQuotesRequested(id.subUserA, id.org) as Array<{ id: string }>
    expect(rows.map((r) => r.id)).toEqual([id.quoteA])
    const none = await new RealSubcontractorService(as(id.subUserB)).listMyQuotesRequested(id.subUserB, id.org)
    expect(none).toEqual([])
  })

  it('refuses a quote response for another company or an unrelated quote', async () => {
    const quotesAsA = new RealQuoteService(as(id.subUserA))
    await expect(quotesAsA.respondToQuote({ id: id.quoteA, organizationId: id.org, subcontractorId: id.subB, response: 'accepted' }))
      .rejects.toBeInstanceOf(ForbiddenError)
    await expect(quotesAsA.respondToQuote({ id: id.quoteOther, organizationId: id.org, subcontractorId: id.subA, response: 'accepted' }))
      .rejects.toBeInstanceOf(ForbiddenError)
    await expect(quotesAsA.respondToQuote({ id: id.quoteA, organizationId: id.org, subcontractorId: id.subA, response: 'declined' }))
      .resolves.toMatchObject({ quoteId: id.quoteA, response: 'declined' })
  })

  it('records the session user as the invite actor, not a forged invitedByUserId', async () => {
    const svc = new RealUserService(as(id.admin), async () => ({ id: 'x', stub: true, provider: 'test', status: 'stubbed' as const }))
    await svc.invite({ organizationId: id.org, email: `scope-invitee-${tag}@example.test`, role: 'field', invitedByUserId: id.subUserB })
    const [invite] = await getDb().select().from(pendingInvites)
      .where(and(eq(pendingInvites.organizationId, id.org), eq(pendingInvites.email, `scope-invitee-${tag}@example.test`)))
    expect(invite?.invitedByUserId).toBe(id.admin)
    const audits = await getDb().select().from(auditLog).where(and(eq(auditLog.organizationId, id.org), eq(auditLog.entityType, 'pending_invite')))
    expect(audits.length).toBeGreaterThan(0)
    for (const row of audits) expect(row.actorUserId).toBe(id.admin)
  })
})

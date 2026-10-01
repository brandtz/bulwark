/**
 * tests/integration/property-pipeline.real.test.ts — WP-B2 backend
 * (AD-10 board, AD-12 hub stats, AD-13 status change).
 *
 *   - summaries(): contract value = accepted quotes; invoiced/paid/balance
 *     from sent/partial/paid invoices (drafts and voids excluded); other-org
 *     and deleted ids are omitted.
 *   - updateStatus(): illegal transitions refused server-side even when the
 *     UI is bypassed; reason/note/resumeOn persisted for the hold banner.
 *   - assignee: only active staff of the same org; list filters by it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { auditLog, invoices, memberships, organizations, properties, quotes, users } from '../../server/db/schema'
import { statusPipelineNodes, statusPipelines } from '../../server/db/schema/status_pipelines'
import { RealPropertyService } from '../../server/services/property.real'
import { RealStatusPipelineService } from '../../server/services/status-pipeline.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('property pipeline backend (WP-B2)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  let orgId: string
  let otherOrgId: string
  let staffId: string
  let homeownerId: string
  const svc = new RealPropertyService()
  const create = (line1: string, org = orgId) => svc.create({
    organizationId: org, addressLine1: line1, addressLine2: null, city: 'Bend', state: 'OR', postalCode: '97701', clientId: null, notes: null,
  })

  beforeAll(async () => {
    const db = getDb()
    const [a] = await db.insert(organizations).values({ name: 'B2 pipeline', slug: `b2-${stamp}` }).returning()
    const [b] = await db.insert(organizations).values({ name: 'B2 other', slug: `b2o-${stamp}` }).returning()
    orgId = a!.id
    otherOrgId = b!.id
    const hash = await bcrypt.hash('x', 4)
    const [s] = await db.insert(users).values({ email: `b2-staff-${stamp}@x.test`, fullName: 'Staff', passwordHash: hash, isActive: true }).returning()
    const [h] = await db.insert(users).values({ email: `b2-home-${stamp}@x.test`, fullName: 'Home', passwordHash: hash, isActive: true }).returning()
    staffId = s!.id
    homeownerId = h!.id
    await db.insert(memberships).values([
      { userId: staffId, organizationId: orgId, role: 'field', isActive: true },
      { userId: homeownerId, organizationId: orgId, role: 'homeowner', isActive: true },
    ])
  })

  afterAll(async () => {
    const db = getDb()
    for (const org of [orgId, otherOrgId]) {
      await db.delete(auditLog).where(eq(auditLog.organizationId, org))
      await db.delete(invoices).where(eq(invoices.organizationId, org))
      await db.delete(quotes).where(eq(quotes.organizationId, org))
      const pipelines = await db.select({ id: statusPipelines.id }).from(statusPipelines).where(eq(statusPipelines.organizationId, org))
      if (pipelines.length) await db.delete(statusPipelineNodes).where(inArray(statusPipelineNodes.pipelineId, pipelines.map((p) => p.id)))
      await db.delete(statusPipelines).where(eq(statusPipelines.organizationId, org))
      await db.delete(properties).where(eq(properties.organizationId, org))
      await db.delete(memberships).where(eq(memberships.organizationId, org))
      await db.delete(organizations).where(eq(organizations.id, org))
    }
    await db.delete(users).where(inArray(users.id, [staffId, homeownerId]))
  })

  it('summaries() rolls up accepted quotes and live invoices per property', async () => {
    const db = getDb()
    const p = await create('1 Money Ln')
    const empty = await create('2 Empty Ln')
    const foreign = await create('3 Foreign Ln', otherOrgId)
    const totals = (c: number) => ({ subtotalCents: c, markupCents: 0, taxCents: 0, totalCents: c })
    await db.insert(quotes).values([
      { organizationId: orgId, propertyId: p.id, createdById: staffId, lineItems: [], totals: totals(500_000), totalCents: 500_000, status: 'accepted', quoteNumber: `B2Q-1-${stamp}` },
      { organizationId: orgId, propertyId: p.id, createdById: staffId, lineItems: [], totals: totals(70_000), totalCents: 70_000, status: 'accepted', quoteNumber: `B2Q-2-${stamp}` },
      { organizationId: orgId, propertyId: p.id, createdById: staffId, lineItems: [], totals: totals(999_999), totalCents: 999_999, status: 'sent', quoteNumber: `B2Q-3-${stamp}` },
    ] as never)
    await db.insert(invoices).values([
      { organizationId: orgId, propertyId: p.id, invoiceNumber: `B2I-1-${stamp}`, lineItems: [], totals: totals(200_000), totalCents: 200_000, status: 'paid', paidAmountCents: 200_000 },
      { organizationId: orgId, propertyId: p.id, invoiceNumber: `B2I-2-${stamp}`, lineItems: [], totals: totals(100_000), totalCents: 100_000, status: 'partial', paidAmountCents: 40_000 },
      { organizationId: orgId, propertyId: p.id, invoiceNumber: `B2I-3-${stamp}`, lineItems: [], totals: totals(55_000), totalCents: 55_000, status: 'draft' },
      { organizationId: orgId, propertyId: p.id, invoiceNumber: `B2I-4-${stamp}`, lineItems: [], totals: totals(66_000), totalCents: 66_000, status: 'voided' },
    ] as never)

    const rows = await svc.summaries([p.id, empty.id, foreign.id], orgId)
    expect(rows.map((r) => r.propertyId).sort()).toEqual([p.id, empty.id].sort())
    expect(rows.find((r) => r.propertyId === p.id)).toEqual({
      propertyId: p.id,
      contractValueCents: 570_000,
      invoicedCents: 300_000,
      paidCents: 240_000,
      balanceCents: 60_000,
      openInvoiceCount: 1,
    })
    expect(rows.find((r) => r.propertyId === empty.id)).toMatchObject({ contractValueCents: 0, balanceCents: 0, openInvoiceCount: 0 })
    await expect(svc.summaries(Array.from({ length: 501 }, () => crypto.randomUUID()), orgId)).rejects.toThrow(/at most 500/u)
  })

  it('updateStatus() refuses illegal transitions and stores hold details', async () => {
    await new RealStatusPipelineService().save({
      organizationId: orgId,
      entityType: 'property',
      nodes: [
        { slug: 'lead', labelKey: 'Lead', color: '#94A3B8', sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['quoted', 'on_hold'] },
        { slug: 'quoted', labelKey: 'Quoted', color: '#7C3AED', sortOrder: 20, isInitial: false, isTerminal: false, wipLimit: 3, allowedTransitions: ['paid'] },
        { slug: 'paid', labelKey: 'Paid', color: '#16A34A', sortOrder: 30, isInitial: false, isTerminal: true, allowedTransitions: [] },
        { slug: 'on_hold', labelKey: 'On hold', color: '#475569', sortOrder: 40, isInitial: false, isTerminal: false, requiresReason: true, allowedTransitions: ['lead'] },
      ],
    })
    const pipeline = await new RealStatusPipelineService().bootstrap({ organizationId: orgId, entityType: 'property' })
    expect(pipeline.nodes.find((n) => n.slug === 'quoted')?.wipLimit).toBe(3)
    expect(pipeline.nodes.find((n) => n.slug === 'lead')?.wipLimit).toBeNull()

    const p = await create('4 Hold St')
    await expect(svc.updateStatus(p.id, 'paid', orgId)).rejects.toThrow(/lead cannot transition to paid/u)
    await expect(svc.updateStatus(p.id, 'on_hold', orgId)).rejects.toThrow(/reason is required/u)
    const held = await svc.updateStatus(p.id, 'on_hold', orgId, 'Awaiting funding', { note: 'Sponsor review in Nov', resumeOn: '2026-11-15' })
    expect(held).toMatchObject({ status: 'on_hold', statusReason: 'Awaiting funding', statusNote: 'Sponsor review in Nov', resumeOn: '2026-11-15' })
    expect(held.statusChangedAt).not.toBeNull()
    const [audit] = await getDb().select().from(auditLog).where(eq(auditLog.entityId, p.id)).orderBy(auditLog.createdAt)
      .then((rows) => rows.filter((r) => r.action === 'state_change'))
    expect(audit?.metadata).toMatchObject({ from: 'lead', to: 'on_hold', reason: 'Awaiting funding', resumeOn: '2026-11-15' })

    const resumed = await svc.updateStatus(p.id, 'lead', orgId)
    expect(resumed).toMatchObject({ status: 'lead', statusReason: null, statusNote: null, resumeOn: null })
  })

  it('assignee must be active staff of the org; list filters by assignee', async () => {
    const p = await create('5 Owner Ave')
    const q = await create('6 Nobody Ave')
    await expect(svc.update({ id: p.id, organizationId: orgId, assigneeUserId: homeownerId })).rejects.toThrow(/Invalid assignee/u)
    await expect(svc.update({ id: p.id, organizationId: otherOrgId, assigneeUserId: staffId })).rejects.toThrow()
    const assigned = await svc.update({ id: p.id, organizationId: orgId, assigneeUserId: staffId })
    expect(assigned.assigneeUserId).toBe(staffId)
    const mine = await svc.list({ organizationId: orgId, assigneeUserId: staffId, page: 1, pageSize: 100 })
    expect(mine.rows.map((r) => r.id)).toEqual([p.id])
    const none = await svc.list({ organizationId: orgId, assigneeUserId: 'none', page: 1, pageSize: 100 })
    expect(none.rows.map((r) => r.id)).toContain(q.id)
    expect(none.rows.map((r) => r.id)).not.toContain(p.id)
    const cleared = await svc.update({ id: p.id, organizationId: orgId, assigneeUserId: null })
    expect(cleared.assigneeUserId).toBeNull()
  })
})

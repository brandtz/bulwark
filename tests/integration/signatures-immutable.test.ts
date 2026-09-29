/**
 * tests/integration/signatures-immutable.test.ts — WP-X2 / ED-00D: signatures
 * are append-only in the database (migration 0022 trigger), signing is scoped
 * by role and property link, and verify detects a changed document.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { homeownerUsers, memberships, organizations, properties, quotes, signatures, users } from '../../server/db/schema'
import { RealSignatureService } from '../../server/services/signature.real'
import { ForbiddenError, TenantViolationError, type TenantContext } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const meta = () => ({ ipAddress: '203.0.113.9', userAgent: 'vitest' })

d('signatures (WP-X2 / ED-00D)', () => {
  const tag = randomUUID().slice(0, 8)
  const id = { org: '', other: '', staff: '', owner: '', stranger: '', propA: '', propB: '', quoteA: '', quoteB: '' }
  const as = (userId: string) => new RealSignatureService(() => ({ userId, organizationId: id.org }) as TenantContext, meta)

  beforeAll(async () => {
    const db = getDb()
    const [o, o2] = await db.insert(organizations).values([
      { name: 'X2 sign', slug: `x2-sign-${tag}` },
      { name: 'X2 sign other', slug: `x2-sign-o-${tag}` },
    ]).returning()
    ;[id.org, id.other] = [o!.id, o2!.id]
    const us = await db.insert(users).values([
      { email: `x2-sign-staff-${tag}@example.test`, fullName: 'Staff', isActive: true },
      { email: `x2-sign-owner-${tag}@example.test`, fullName: 'Owner', isActive: true },
      { email: `x2-sign-stranger-${tag}@example.test`, fullName: 'Stranger', isActive: true },
    ]).returning()
    ;[id.staff, id.owner, id.stranger] = us.map((u) => u.id) as [string, string, string]
    await db.insert(memberships).values([
      { userId: id.staff, organizationId: id.org, role: 'field' },
      { userId: id.owner, organizationId: id.org, role: 'homeowner' },
      { userId: id.stranger, organizationId: id.org, role: 'homeowner' },
    ])
    const [pa, pb] = await db.insert(properties).values([
      { organizationId: id.org, addressLine1: '1 Sign St', city: 'C', state: 'CA', postalCode: '0' },
      { organizationId: id.org, addressLine1: '2 Sign St', city: 'C', state: 'CA', postalCode: '0' },
    ]).returning()
    ;[id.propA, id.propB] = [pa!.id, pb!.id]
    await db.insert(homeownerUsers).values({ organizationId: id.org, propertyId: id.propA, userId: id.owner })
    const zero = { subtotalCents: 0, markupCents: 0, taxCents: 0, totalCents: 0 }
    const base = { organizationId: id.org, createdById: id.staff, lineItems: [], markupPercent: 0, taxPercent: 0, totals: zero, totalCents: 0, status: 'sent' }
    const qs = await db.insert(quotes).values([
      { ...base, propertyId: id.propA, quoteNumber: `Q-${tag}-A` },
      { ...base, propertyId: id.propB, quoteNumber: `Q-${tag}-B` },
    ] as Array<typeof quotes.$inferInsert>).returning()
    ;[id.quoteA, id.quoteB] = qs.map((q) => q.id) as [string, string]
  })

  afterAll(async () => {
    const db = getDb()
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL bulwark.signature_purge = 'on'`)
      await tx.delete(signatures).where(eq(signatures.organizationId, id.org))
    })
    await db.delete(quotes).where(eq(quotes.organizationId, id.org))
    await db.delete(homeownerUsers).where(eq(homeownerUsers.organizationId, id.org))
    await db.delete(properties).where(eq(properties.organizationId, id.org))
  })

  const input = (entityId: string, doc = 'quote v1') => ({
    organizationId: id.org, entityType: 'quote' as const, entityId,
    signerName: 'Pat Owner', method: 'typed' as const, consent: true as const, documentHash: hash(doc),
  })

  it('staff signs; IP/UA come from the request; verify detects a changed document', async () => {
    const sig = await as(id.staff).create(input(id.quoteA))
    expect(sig.ipAddress).toBe('203.0.113.9')
    expect(sig.userAgent).toBe('vitest')
    expect(sig.signerUserId).toBe(id.staff)
    expect(await as(id.staff).verify({ organizationId: id.org, id: sig.id, documentHash: hash('quote v1') })).toEqual({ valid: true })
    expect(await as(id.staff).verify({ organizationId: id.org, id: sig.id, documentHash: hash('quote v2') })).toEqual({ valid: false })
  })

  it('homeowners sign only quotes on their linked property', async () => {
    const mine = await as(id.owner).create(input(id.quoteA))
    expect(mine.signerUserId).toBe(id.owner)
    await expect(as(id.owner).create(input(id.quoteB))).rejects.toBeInstanceOf(ForbiddenError)
    await expect(as(id.stranger).create(input(id.quoteA))).rejects.toBeInstanceOf(ForbiddenError)
    await expect(as(id.stranger).listForEntity({ organizationId: id.org, entityType: 'quote', entityId: id.quoteA })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('requires consent and rejects cross-tenant calls', async () => {
    await expect(as(id.staff).create({ ...input(id.quoteA), consent: false as unknown as true })).rejects.toThrow(/Consent/u)
    await expect(as(id.staff).create({ ...input(id.quoteA), organizationId: id.other })).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('UPDATE and DELETE are rejected by the database', async () => {
    const sig = await as(id.staff).create(input(id.quoteA, 'immutable'))
    const db = getDb()
    // drizzle wraps the Postgres error; the trigger's message is on `cause`.
    const reason = (e: unknown) => String((e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message)
    expect(reason(await db.update(signatures).set({ signerName: 'Forged' }).where(eq(signatures.id, sig.id)).then(() => null, (e: unknown) => e))).toMatch(/append-only \(UPDATE rejected\)/u)
    expect(reason(await db.delete(signatures).where(eq(signatures.id, sig.id)).then(() => null, (e: unknown) => e))).toMatch(/append-only \(DELETE rejected\)/u)
    const [row] = await db.select().from(signatures).where(eq(signatures.id, sig.id))
    expect(row!.signerName).toBe('Pat Owner')
  })
})

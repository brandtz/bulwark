/**
 * tests/integration/people-backfill.real.test.ts — WP-X2 / ED-036 backfill in
 * migration 0021: contacts → people, deduped by (org, lower(trim(email))).
 *
 * Runs the migration's own backfill statements (read from the .sql file) against
 * seeded contacts, twice, to prove the dedupe and that a re-run is a no-op.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { contacts, organizations, people, properties } from '../../server/db/schema'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

/** The four data statements at the end of 0021 (after the last DDL). */
const BACKFILL = readFileSync('server/db/migrations/0021_x2_people_permits_sessions.sql', 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter((s) => /^(INSERT INTO "people"|UPDATE "contacts")/u.test(s))

d('0021 contacts → people backfill (WP-X2 / ED-036)', () => {
  let orgId: string
  let otherOrgId: string
  let propertyId: string
  let noEmailContactId: string

  beforeAll(async () => {
    const db = getDb()
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const [o] = await db.insert(organizations).values({ name: 'X2 people', slug: `x2-people-${stamp}` }).returning()
    const [o2] = await db.insert(organizations).values({ name: 'X2 people 2', slug: `x2-people2-${stamp}` }).returning()
    orgId = o!.id
    otherOrgId = o2!.id
    const [p] = await db.insert(properties).values({ organizationId: orgId, addressLine1: 'P', city: 'C', state: 'CA', postalCode: '0' }).returning()
    const [p2] = await db.insert(properties).values({ organizationId: otherOrgId, addressLine1: 'P', city: 'C', state: 'CA', postalCode: '0' }).returning()
    propertyId = p!.id
    const email = `dup-${stamp}@example.com`
    const rows = await db.insert(contacts).values([
      { organizationId: orgId, propertyId, firstName: 'Ana', lastName: 'Diaz', email, phone: '555-0101' },
      { organizationId: orgId, propertyId, firstName: 'Ana M.', lastName: 'Diaz', email: `  ${email.toUpperCase()} `, phone: '555-0202' },
      { organizationId: orgId, propertyId, firstName: 'No', lastName: 'Email', email: null, phone: '555-0303' },
      // Same email in ANOTHER org must become a separate person.
      { organizationId: otherOrgId, propertyId: p2!.id, firstName: 'Ana', lastName: 'Diaz', email },
    ]).returning()
    noEmailContactId = rows[2]!.id
    for (const stmt of BACKFILL) await db.execute(sql.raw(stmt))
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(contacts).where(inArray(contacts.organizationId, [orgId, otherOrgId]))
    await db.delete(people).where(inArray(people.organizationId, [orgId, otherOrgId]))
    await db.delete(properties).where(inArray(properties.organizationId, [orgId, otherOrgId]))
    await db.delete(organizations).where(inArray(organizations.id, [orgId, otherOrgId]))
  })

  it('found the four backfill statements in the migration', () => {
    expect(BACKFILL).toHaveLength(4)
  })

  it('merges same-email contacts (case/space-insensitive) into one person per org', async () => {
    const db = getDb()
    const inOrg = await db.select().from(people).where(eq(people.organizationId, orgId))
    expect(inOrg).toHaveLength(2) // Ana (merged) + No Email
    const ana = inOrg.find((p) => p.primaryEmail !== null)!
    expect(ana.firstName).toBe('Ana') // first-seen name wins
    expect([...ana.phones].sort()).toEqual(['555-0101', '555-0202'])
    const linked = await db.select().from(contacts).where(eq(contacts.organizationId, orgId))
    expect(linked.filter((c) => c.personId === ana.id)).toHaveLength(2)
    expect((await db.select().from(people).where(eq(people.organizationId, otherOrgId)))).toHaveLength(1)
  })

  it('gives an email-less contact its own person (id = contact id)', async () => {
    const db = getDb()
    const [c] = await db.select().from(contacts).where(eq(contacts.id, noEmailContactId))
    expect(c!.personId).toBe(noEmailContactId)
    const [p] = await db.select().from(people).where(eq(people.id, noEmailContactId))
    expect(p!.phones).toEqual(['555-0303'])
  })

  it('is idempotent', async () => {
    const db = getDb()
    for (const stmt of BACKFILL) await db.execute(sql.raw(stmt))
    expect(await db.select().from(people).where(eq(people.organizationId, orgId))).toHaveLength(2)
  })
})

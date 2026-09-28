/**
 * tests/integration/people-contacts.real.test.ts — WP-X2 / ED-036: one person,
 * many property contacts. Contacts created through the contact service with the
 * same email land on the same people row; attachToProperty links an existing
 * person; the person service is tenant-bound.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { contacts, memberships, organizations, people, properties, users } from '../../server/db/schema'
import { RealContactService } from '../../server/services/contact.real'
import { RealPersonService } from '../../server/services/person.real'
import { TenantViolationError, type TenantContext } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('people + contacts (WP-X2 / ED-036)', () => {
  const tag = randomUUID().slice(0, 8)
  const id = { org: '', other: '', user: '', propA: '', propB: '' }
  let ctx: TenantContext
  const resolver = () => ctx

  beforeAll(async () => {
    const db = getDb()
    const [o, o2] = await db.insert(organizations).values([
      { name: 'X2 contacts', slug: `x2-contacts-${tag}` },
      { name: 'X2 contacts other', slug: `x2-contacts-o-${tag}` },
    ]).returning()
    ;[id.org, id.other] = [o!.id, o2!.id]
    const [u] = await db.insert(users).values({ email: `x2-contacts-${tag}@example.test`, fullName: 'Admin', isActive: true }).returning()
    id.user = u!.id
    await db.insert(memberships).values({ userId: id.user, organizationId: id.org, role: 'org_admin' })
    const [pa, pb] = await db.insert(properties).values([
      { organizationId: id.org, addressLine1: '1 A St', city: 'C', state: 'CA', postalCode: '0' },
      { organizationId: id.org, addressLine1: '2 B St', city: 'C', state: 'CA', postalCode: '0' },
    ]).returning()
    ;[id.propA, id.propB] = [pa!.id, pb!.id]
    ctx = { userId: id.user, organizationId: id.org }
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(contacts).where(eq(contacts.organizationId, id.org))
    await db.delete(people).where(eq(people.organizationId, id.org))
    await db.delete(properties).where(eq(properties.organizationId, id.org))
    await db.delete(memberships).where(eq(memberships.userId, id.user))
  })

  it('same email on two properties → one people row', async () => {
    const svc = new RealContactService(resolver)
    const email = `ana-${tag}@example.test`
    const a = await svc.create({ organizationId: id.org, propertyId: id.propA, kind: 'owner', firstName: 'Ana', lastName: 'Diaz', email })
    const b = await svc.create({ organizationId: id.org, propertyId: id.propB, kind: 'tenant', firstName: 'Ana', lastName: 'Diaz', email: email.toUpperCase() })
    expect(a.personId).toBeTruthy()
    expect(b.personId).toBe(a.personId)
    const rows = await getDb().select().from(people).where(eq(people.organizationId, id.org))
    expect(rows.filter((p) => p.primaryEmail === email)).toHaveLength(1)

    const persons = new RealPersonService(resolver)
    const linked = await persons.listProperties(a.personId!, id.org)
    expect(linked.map((l) => l.propertyId).sort()).toEqual([id.propA, id.propB].sort())
  })

  it('attachToProperty links an existing person and refuses a duplicate link', async () => {
    const persons = new RealPersonService(resolver)
    const p = await persons.create({ organizationId: id.org, firstName: 'Bo', lastName: 'Lee', emails: [`bo-${tag}@example.test`] })
    const { contactId } = await persons.attachToProperty({ organizationId: id.org, personId: p.id, propertyId: id.propA, isBilling: true })
    const [c] = await getDb().select().from(contacts).where(eq(contacts.id, contactId))
    expect(c!.personId).toBe(p.id)
    expect(c!.isBilling).toBe(true)
    await expect(persons.attachToProperty({ organizationId: id.org, personId: p.id, propertyId: id.propA })).rejects.toThrow(/already a contact/u)
    expect((await persons.findByEmail(`BO-${tag}@example.test`, id.org))?.id).toBe(p.id)
  })

  it('refuses a second person with the same email in the org', async () => {
    const persons = new RealPersonService(resolver)
    await expect(persons.create({ organizationId: id.org, firstName: 'Ana', emails: [`ana-${tag}@example.test`] })).rejects.toThrow(/already belongs/u)
  })

  it('cross-tenant access → TenantViolationError', async () => {
    const persons = new RealPersonService(resolver)
    await expect(persons.list({ organizationId: id.other })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(persons.create({ organizationId: id.other, firstName: 'X' })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(persons.get(randomUUID(), id.other)).rejects.toBeInstanceOf(TenantViolationError)
  })

  afterAll(async () => {
    await getDb().delete(organizations).where(inArray(organizations.id, [id.other])).catch(() => {})
  })
})

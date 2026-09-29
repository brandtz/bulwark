/**
 * server/services/person.real.ts — RealPersonService (WP-X2, ED-036).
 *
 * People are org-scoped and deduped by lowercased primary email; `contacts` is
 * the property join. `ensurePersonForContact` is the dual-write hook the
 * contact service calls so every new contact row points at a person (existing
 * rows were linked by the 0021 backfill).
 */
import { and, asc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import { getDb } from '../db/client'
import { contacts } from '../db/schema/contacts'
import { people, type PersonRow } from '../db/schema/people'
import { properties } from '../db/schema/properties'
import {
  PersonAttachInputSchema,
  PersonCreateInputSchema,
  PersonListInputSchema,
  PersonUpdateInputSchema,
  type IPersonService,
  type Person,
  type PersonAttachInput,
  type PersonCreateInput,
  type PersonListInput,
  type PersonListOutput,
  type PersonUpdateInput,
} from '../../shared/contracts/person'
import { escapeLikeContains } from '../../shared/utils/likeEscape'
import { assertSameTenant, resolveActorUserId, type TenantResolver } from './_tenant'
import { withAudit, type AuditCtx } from './_tx'

type Tx = AuditCtx['tx']

function toContract(r: PersonRow): Person {
  return {
    id: r.id,
    organizationId: r.organizationId,
    firstName: r.firstName,
    lastName: r.lastName,
    primaryEmail: r.primaryEmail,
    emails: r.emails ?? [],
    phones: r.phones ?? [],
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

const norm = (email: string) => email.trim().toLowerCase()
const uniq = (xs: string[]) => [...new Set(xs)]

function parse<T>(schema: { safeParse(v: unknown): { success: true, data: T } | { success: false, error: { issues: Array<{ path: Array<string | number>, message: string }> } } }, input: unknown, what: string): T {
  const r = schema.safeParse(input)
  if (!r.success) throw new Error(`Invalid ${what}: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
  return r.data
}

/**
 * Find (by email) or create the person behind a new contact row. Runs inside
 * the caller's transaction. Email-less contacts always get a fresh person.
 */
export async function ensurePersonForContact(
  tx: Tx,
  input: { organizationId: string, firstName: string, lastName: string, email?: string | null, phone?: string | null },
): Promise<string> {
  const email = input.email?.trim() ? norm(input.email) : null
  if (email) {
    const [existing] = await tx.select().from(people).where(and(
      eq(people.organizationId, input.organizationId),
      eq(people.primaryEmail, email),
      isNull(people.deletedAt),
    )).limit(1)
    if (existing) {
      if (input.phone && !existing.phones.includes(input.phone)) {
        await tx.update(people).set({ phones: [...existing.phones, input.phone], updatedAt: new Date() }).where(eq(people.id, existing.id))
      }
      return existing.id
    }
  }
  const [row] = await tx.insert(people).values({
    organizationId: input.organizationId,
    firstName: input.firstName,
    lastName: input.lastName,
    primaryEmail: email,
    emails: email ? [email] : [],
    phones: input.phone ? [input.phone] : [],
  }).returning({ id: people.id })
  return row!.id
}

export class RealPersonService implements IPersonService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: PersonListInput): Promise<PersonListOutput> {
    const v = parse(PersonListInputSchema, input, 'person list')
    assertSameTenant(this.tenantResolver, v.organizationId)
    const conds: SQL[] = [eq(people.organizationId, v.organizationId), isNull(people.deletedAt)]
    if (v.search) {
      const q = escapeLikeContains(v.search)
      conds.push(or(
        ilike(people.firstName, q),
        ilike(people.lastName, q),
        sql`${people.emails}::text ILIKE ${q}`,
        sql`${people.phones}::text ILIKE ${q}`,
      )!)
    }
    const where = and(...conds)
    const db = getDb()
    const [rows, [total]] = await Promise.all([
      db.select().from(people).where(where).orderBy(asc(people.lastName), asc(people.firstName), asc(people.id))
        .limit(v.pageSize).offset((v.page - 1) * v.pageSize),
      db.select({ n: sql<number>`count(*)::int` }).from(people).where(where),
    ])
    return { rows: rows.map(toContract), total: total?.n ?? 0, page: v.page, pageSize: v.pageSize }
  }

  async get(id: string, organizationId: string): Promise<Person | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const [row] = await getDb().select().from(people)
      .where(and(eq(people.id, id), eq(people.organizationId, organizationId), isNull(people.deletedAt))).limit(1)
    return row ? toContract(row) : null
  }

  async findByEmail(email: string, organizationId: string): Promise<Person | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const [row] = await getDb().select().from(people)
      .where(and(eq(people.organizationId, organizationId), eq(people.primaryEmail, norm(email)), isNull(people.deletedAt))).limit(1)
    return row ? toContract(row) : null
  }

  async create(input: PersonCreateInput): Promise<Person> {
    const v = parse(PersonCreateInputSchema, input, 'person')
    assertSameTenant(this.tenantResolver, v.organizationId)
    const emails = uniq(v.emails.map(norm))
    const primaryEmail = emails[0] ?? null
    if (primaryEmail && await this.findByEmail(primaryEmail, v.organizationId)) {
      throw new Error(`Invalid person: ${primaryEmail} already belongs to someone in this organization`)
    }
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx.insert(people).values({
        organizationId: v.organizationId,
        firstName: v.firstName,
        lastName: v.lastName,
        primaryEmail,
        emails,
        phones: uniq(v.phones),
        notes: v.notes ?? null,
      }).returning()
      await audit.record({
        organizationId: v.organizationId,
        entityType: 'person',
        entityId: row!.id,
        action: 'create',
        actorUserId: resolveActorUserId(this.tenantResolver),
        after: { firstName: row!.firstName, lastName: row!.lastName, primaryEmail },
      })
      return toContract(row!)
    })
  }

  async update(input: PersonUpdateInput): Promise<Person> {
    const v = parse(PersonUpdateInputSchema, input, 'person update')
    assertSameTenant(this.tenantResolver, v.organizationId)
    const before = await this.get(v.id, v.organizationId)
    if (!before) throw new Error('Person not found')
    const patch: Partial<typeof people.$inferInsert> = { updatedAt: new Date() }
    if (v.firstName !== undefined) patch.firstName = v.firstName
    if (v.lastName !== undefined) patch.lastName = v.lastName
    if (v.phones !== undefined) patch.phones = uniq(v.phones)
    if (v.notes !== undefined) patch.notes = v.notes ?? null
    if (v.emails !== undefined) {
      const emails = uniq(v.emails.map(norm))
      const primaryEmail = emails[0] ?? null
      if (primaryEmail && primaryEmail !== before.primaryEmail) {
        const clash = await this.findByEmail(primaryEmail, v.organizationId)
        if (clash && clash.id !== v.id) throw new Error(`Invalid person update: ${primaryEmail} already belongs to someone in this organization`)
      }
      patch.emails = emails
      patch.primaryEmail = primaryEmail
    }
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx.update(people).set(patch)
        .where(and(eq(people.id, v.id), eq(people.organizationId, v.organizationId))).returning()
      await audit.record({
        organizationId: v.organizationId,
        entityType: 'person',
        entityId: v.id,
        action: 'update',
        actorUserId: resolveActorUserId(this.tenantResolver),
        before: { firstName: before.firstName, lastName: before.lastName, primaryEmail: before.primaryEmail },
        after: { firstName: row!.firstName, lastName: row!.lastName, primaryEmail: row!.primaryEmail },
      })
      return toContract(row!)
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [live] = await tx.select({ id: contacts.id }).from(contacts)
        .where(and(eq(contacts.personId, id), eq(contacts.organizationId, organizationId), isNull(contacts.deletedAt))).limit(1)
      if (live) throw new Error('Invalid delete: this person is still a contact on a property; remove them there first')
      const [row] = await tx.update(people).set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(people.id, id), eq(people.organizationId, organizationId), isNull(people.deletedAt))).returning({ id: people.id })
      if (!row) throw new Error('Person not found')
      await audit.record({ organizationId, entityType: 'person', entityId: id, action: 'delete', actorUserId: resolveActorUserId(this.tenantResolver) })
    })
  }

  async attachToProperty(input: PersonAttachInput): Promise<{ contactId: string }> {
    const v = parse(PersonAttachInputSchema, input, 'attach')
    assertSameTenant(this.tenantResolver, v.organizationId)
    const person = await this.get(v.personId, v.organizationId)
    if (!person) throw new Error('Person not found')
    return await withAudit(async ({ tx, audit }) => {
      // contacts.property_id has a single-column FK, so the org must be checked
      // here or a contact row could reference another tenant's property.
      const [property] = await tx.select({ id: properties.id }).from(properties).where(and(
        eq(properties.id, v.propertyId), eq(properties.organizationId, v.organizationId), isNull(properties.deletedAt),
      )).limit(1)
      if (!property) throw new Error('Property not found')
      const [existing] = await tx.select({ id: contacts.id }).from(contacts).where(and(
        eq(contacts.organizationId, v.organizationId),
        eq(contacts.propertyId, v.propertyId),
        eq(contacts.personId, v.personId),
        isNull(contacts.deletedAt),
      )).limit(1)
      if (existing) throw new Error('Invalid attach: this person is already a contact on the property')
      if (v.isPrimary) {
        await tx.update(contacts).set({ isPrimary: false, updatedAt: new Date() }).where(and(
          eq(contacts.organizationId, v.organizationId), eq(contacts.propertyId, v.propertyId), eq(contacts.isPrimary, true), isNull(contacts.deletedAt),
        ))
      }
      // Denormalized name/email/phone keep today's contact readers working (ED-036 transition).
      const [row] = await tx.insert(contacts).values({
        organizationId: v.organizationId,
        propertyId: v.propertyId,
        personId: v.personId,
        kind: v.kind,
        isPrimary: v.isPrimary,
        isBilling: v.isBilling,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.primaryEmail,
        phone: person.phones[0] ?? null,
      }).returning({ id: contacts.id })
      await audit.record({
        organizationId: v.organizationId,
        entityType: 'contact',
        entityId: row!.id,
        action: 'create',
        actorUserId: resolveActorUserId(this.tenantResolver),
        after: { personId: v.personId, propertyId: v.propertyId, kind: v.kind },
      })
      return { contactId: row!.id }
    })
  }

  async listProperties(personId: string, organizationId: string) {
    assertSameTenant(this.tenantResolver, organizationId)
    const rows = await getDb().select().from(contacts).where(and(
      eq(contacts.organizationId, organizationId), eq(contacts.personId, personId), isNull(contacts.deletedAt),
    ))
    return rows.filter((r) => r.propertyId).map((r) => ({
      contactId: r.id,
      propertyId: r.propertyId!,
      kind: r.kind,
      isPrimary: r.isPrimary,
      isBilling: r.isBilling,
    }))
  }
}

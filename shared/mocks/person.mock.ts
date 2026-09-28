/**
 * shared/mocks/person.mock.ts — MockPersonService (WP-X2, ED-036). Same rules
 * as the real service (email dedupe per org, delete blocked while linked),
 * in memory. Property links are created through the contact mock.
 */
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
} from '../contracts/person'
import type { IContactService } from '../contracts/contact'
import { assertSameTenant, type TenantResolver } from './tenant'

const norm = (e: string) => e.trim().toLowerCase()
const uniq = (xs: string[]) => [...new Set(xs)]
const now = () => new Date().toISOString()

export class MockPersonService implements IPersonService {
  private rows: Person[] = []
  private links: Array<{ contactId: string, personId: string, propertyId: string, kind: string, isPrimary: boolean, isBilling: boolean }> = []

  constructor(
    private readonly tenantResolver?: TenantResolver,
    private readonly contactsSvc?: IContactService,
  ) {}

  private live(org: string) {
    return this.rows.filter((r) => r.organizationId === org && !r.deletedAt)
  }

  async list(input: PersonListInput): Promise<PersonListOutput> {
    const v = PersonListInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    const q = v.search?.toLowerCase()
    const all = this.live(v.organizationId)
      .filter((p) => !q || [p.firstName, p.lastName, ...p.emails, ...p.phones].some((x) => x.toLowerCase().includes(q)))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    const start = (v.page - 1) * v.pageSize
    return { rows: all.slice(start, start + v.pageSize), total: all.length, page: v.page, pageSize: v.pageSize }
  }

  async get(id: string, organizationId: string): Promise<Person | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    return this.live(organizationId).find((p) => p.id === id) ?? null
  }

  async findByEmail(email: string, organizationId: string): Promise<Person | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    return this.live(organizationId).find((p) => p.primaryEmail === norm(email)) ?? null
  }

  async create(input: PersonCreateInput): Promise<Person> {
    const v = PersonCreateInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    const emails = uniq(v.emails.map(norm))
    if (emails[0] && await this.findByEmail(emails[0], v.organizationId)) {
      throw new Error(`Invalid person: ${emails[0]} already belongs to someone in this organization`)
    }
    const row: Person = {
      id: globalThis.crypto.randomUUID(),
      organizationId: v.organizationId,
      firstName: v.firstName,
      lastName: v.lastName,
      primaryEmail: emails[0] ?? null,
      emails,
      phones: uniq(v.phones),
      notes: v.notes ?? null,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    }
    this.rows.push(row)
    return row
  }

  async update(input: PersonUpdateInput): Promise<Person> {
    const v = PersonUpdateInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    const row = this.live(v.organizationId).find((p) => p.id === v.id)
    if (!row) throw new Error('Person not found')
    if (v.emails !== undefined) {
      const emails = uniq(v.emails.map(norm))
      const clash = emails[0] ? await this.findByEmail(emails[0], v.organizationId) : null
      if (clash && clash.id !== row.id) throw new Error(`Invalid person update: ${emails[0]} already belongs to someone in this organization`)
      row.emails = emails
      row.primaryEmail = emails[0] ?? null
    }
    if (v.firstName !== undefined) row.firstName = v.firstName
    if (v.lastName !== undefined) row.lastName = v.lastName
    if (v.phones !== undefined) row.phones = uniq(v.phones)
    if (v.notes !== undefined) row.notes = v.notes ?? null
    row.updatedAt = now()
    return row
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    if (this.links.some((l) => l.personId === id)) throw new Error('Invalid delete: this person is still a contact on a property; remove them there first')
    const row = this.live(organizationId).find((p) => p.id === id)
    if (!row) throw new Error('Person not found')
    row.deletedAt = now()
  }

  async attachToProperty(input: PersonAttachInput): Promise<{ contactId: string }> {
    const v = PersonAttachInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    const person = await this.get(v.personId, v.organizationId)
    if (!person) throw new Error('Person not found')
    if (this.links.some((l) => l.personId === v.personId && l.propertyId === v.propertyId)) {
      throw new Error('Invalid attach: this person is already a contact on the property')
    }
    const contactId = this.contactsSvc
      ? (await this.contactsSvc.create({
          organizationId: v.organizationId,
          propertyId: v.propertyId,
          kind: v.kind,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.primaryEmail,
          phone: person.phones[0] ?? null,
          isPrimary: v.isPrimary,
        } as never)).id
      : globalThis.crypto.randomUUID()
    this.links.push({ contactId, personId: v.personId, propertyId: v.propertyId, kind: v.kind, isPrimary: v.isPrimary, isBilling: v.isBilling })
    return { contactId }
  }

  async listProperties(personId: string, organizationId: string) {
    assertSameTenant(this.tenantResolver, organizationId)
    return this.links.filter((l) => l.personId === personId).map(({ personId: _p, ...rest }) => rest)
  }
}

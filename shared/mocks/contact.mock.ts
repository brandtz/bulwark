/**
 * shared/mocks/contact.mock.ts — MockContactService (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008)
 *   - `setPrimary(id)` is the gateway through which the
 *     "single primary per property" invariant is maintained: on call we
 *     demote every sibling whose `propertyId` matches in the same
 *     transaction.
 *   - `create({ isPrimary: true, propertyId })` follows the same path —
 *     siblings demoted before the row lands.
 *   - Contacts without a property cannot be marked primary in W2-1;
 *     the service throws to keep the semantics tight. Client-scoped
 *     primary contact is a future slice.
 */
import type {
  Contact,
  ContactCreateInput,
  ContactUpdateInput,
  IContactService,
} from '../contracts/contact'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: Contact[] = []
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

function demoteSiblings(propertyId: string, organizationId: string, exceptId?: string) {
  const now = nowIso()
  for (const r of rows) {
    if (
      r.organizationId === organizationId &&
      r.propertyId === propertyId &&
      r.isPrimary &&
      r.id !== exceptId &&
      !r.deletedAt
    ) {
      r.isPrimary = false
      r.updatedAt = now
    }
  }
}

export class MockContactService implements IContactService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(organizationId: string): Promise<Contact[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows.filter(r => r.organizationId === organizationId && !r.deletedAt)
  }

  async listForProperty(propertyId: string, organizationId: string): Promise<Contact[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows
      .filter(r => r.organizationId === organizationId && r.propertyId === propertyId && !r.deletedAt)
      .slice()
      .sort((a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary)
          || a.sortOrder - b.sortOrder
          || a.createdAt.localeCompare(b.createdAt),
      )
  }

  async listForClient(clientId: string, organizationId: string): Promise<Contact[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows
      .filter(r => r.organizationId === organizationId && r.clientId === clientId && !r.deletedAt)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
  }

  async get(id: string, organizationId: string): Promise<Contact | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  async create(input: ContactCreateInput): Promise<Contact> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const propertyId = input.propertyId ?? null
    const clientId = input.clientId ?? null
    if (!propertyId && !clientId) {
      throw new Error('Contact requires propertyId or clientId')
    }
    const wantsPrimary = input.isPrimary === true
    if (wantsPrimary && !propertyId) {
      throw new Error('Cannot set primary on a contact without propertyId')
    }
    if (wantsPrimary && propertyId) demoteSiblings(propertyId, input.organizationId)
    const now = nowIso()
    const row: Contact = {
      id: newId(),
      organizationId: input.organizationId,
      propertyId,
      clientId,
      kind: input.kind ?? 'other',
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      isPrimary: wantsPrimary,
      sortOrder: input.sortOrder ?? rows.filter(r =>
        r.propertyId === propertyId && r.clientId === clientId && !r.deletedAt,
      ).length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async update(input: ContactUpdateInput): Promise<Contact> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const r = rows.find(x => x.id === input.id && x.organizationId === input.organizationId)
    if (!r || r.deletedAt) throw new Error('Contact not found')
    if (input.kind !== undefined) r.kind = input.kind
    if (input.firstName !== undefined) r.firstName = input.firstName
    if (input.lastName !== undefined) r.lastName = input.lastName
    if (input.email !== undefined) r.email = input.email ?? null
    if (input.phone !== undefined) r.phone = input.phone ?? null
    if (input.notes !== undefined) r.notes = input.notes ?? null
    if (input.sortOrder !== undefined) r.sortOrder = input.sortOrder
    if (input.isPrimary !== undefined) {
      if (input.isPrimary && !r.propertyId) {
        throw new Error('Cannot set primary on a contact without propertyId')
      }
      if (input.isPrimary && r.propertyId) {
        demoteSiblings(r.propertyId, r.organizationId, r.id)
      }
      r.isPrimary = input.isPrimary
    }
    r.updatedAt = nowIso()
    return r
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r) throw new Error('Contact not found')
    r.deletedAt = nowIso()
    r.updatedAt = r.deletedAt
  }

  async setPrimary(id: string, organizationId: string): Promise<Contact> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r || r.deletedAt) throw new Error('Contact not found')
    if (!r.propertyId) {
      throw new Error('Cannot set primary on a contact without propertyId')
    }
    demoteSiblings(r.propertyId, organizationId, r.id)
    r.isPrimary = true
    r.updatedAt = nowIso()
    return r
  }
}

/** Test-only: reset store. */
export function __resetContactMock(): void {
  rows.length = 0
}

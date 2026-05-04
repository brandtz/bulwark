/**
 * shared/mocks/property.mock.ts — MockPropertyService.
 *
 * Backed by the in-memory FIXTURE_PROPERTIES list. Every method enforces
 * organizationId scoping so any UI bug that drops scope is caught even
 * against the mock.
 */
import type {
  IPropertyService, Property, PropertyCreateInput, PropertyListInput,
  PropertyListOutput, PropertyStatus, PropertyUpdateInput,
} from '../contracts/property'
import { FIXTURE_PROPERTIES } from './fixtures'

const rows: Property[] = [...FIXTURE_PROPERTIES]
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockPropertyService implements IPropertyService {
  async list(input: PropertyListInput): Promise<PropertyListOutput> {
    let scoped = rows.filter(r =>
      r.organizationId === input.organizationId && r.deletedAt === null
    )
    if (input.status) scoped = scoped.filter(r => r.status === input.status)
    if (input.search) {
      const q = input.search.toLowerCase()
      scoped = scoped.filter(r =>
        r.addressLine1.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q),
      )
    }
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Property | null> {
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  async create(input: PropertyCreateInput): Promise<Property> {
    const now = nowIso()
    const row: Property = {
      id: newId(),
      organizationId: input.organizationId,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      clientId: input.clientId ?? null,
      status: 'lead',
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.unshift(row)
    return row
  }

  async update(input: PropertyUpdateInput): Promise<Property> {
    const r = rows.find(x => x.id === input.id && x.organizationId === input.organizationId)
    if (!r) throw new Error('Property not found')
    Object.assign(r, input, { updatedAt: nowIso() })
    return r
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r) throw new Error('Property not found')
    r.deletedAt = nowIso()
  }

  async updateStatus(id: string, status: PropertyStatus, organizationId: string): Promise<Property> {
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r) throw new Error('Property not found')
    r.status = status
    r.updatedAt = nowIso()
    return r
  }
}

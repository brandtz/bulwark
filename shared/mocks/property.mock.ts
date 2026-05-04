/**
 * shared/mocks/property.mock.ts — MockPropertyService.
 *
 * Backed by the in-memory FIXTURE_PROPERTIES list. Every method enforces
 * organizationId scoping so any UI bug that drops scope is caught even
 * against the mock.
 *
 * # Decisions (ADR-0008)
 *   - E2-S7 tenant firewall: every method that takes an `organizationId`
 *     calls `assertSameTenant(this.tenantResolver, ...)` first. If the
 *     active session belongs to a different org than the request, we throw
 *     `TenantViolationError` BEFORE touching the row store. This makes a
 *     UI bug that forwards a stale org id loud and immediate.
 *   - The resolver is optional — when constructed without one (e.g. unit
 *     tests), the firewall short-circuits and the mock behaves the same
 *     as before. The factory wires a real resolver in production paths.
 */
import type {
  IPropertyService, Property, PropertyCreateInput, PropertyListInput,
  PropertyListOutput, PropertyStatus, PropertyUpdateInput,
} from '../contracts/property'
import { FIXTURE_PROPERTIES } from './fixtures'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: Property[] = [...FIXTURE_PROPERTIES]
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockPropertyService implements IPropertyService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: PropertyListInput): Promise<PropertyListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
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
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  async create(input: PropertyCreateInput): Promise<Property> {
    assertSameTenant(this.tenantResolver, input.organizationId)
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
    assertSameTenant(this.tenantResolver, input.organizationId)
    const r = rows.find(x => x.id === input.id && x.organizationId === input.organizationId)
    if (!r) throw new Error('Property not found')
    Object.assign(r, input, { updatedAt: nowIso() })
    return r
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r) throw new Error('Property not found')
    r.deletedAt = nowIso()
  }

  async updateStatus(id: string, status: PropertyStatus, organizationId: string): Promise<Property> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r) throw new Error('Property not found')
    r.status = status
    r.updatedAt = nowIso()
    return r
  }
}

/**
 * shared/mocks/permit.mock.ts — MockPermitService (WP-X2, ED-039). Same rules
 * as the real service (validatePermitState, unique jurisdiction names,
 * delete-in-use guard), in memory. Work-order/property consistency is not
 * checked here (no cross-mock lookup); the real service enforces it.
 */
import {
  PermitCreateInputSchema,
  PermitListInputSchema,
  PermitUpdateInputSchema,
  validatePermitState,
  type IPermitService,
  type Jurisdiction,
  type Permit,
  type PermitCreateInput,
  type PermitListInput,
  type PermitUpdateInput,
} from '../contracts/permit'
import { assertSameTenant, type TenantResolver } from './tenant'

const now = () => new Date().toISOString()

export class MockPermitService implements IPermitService {
  private permits: Permit[] = []
  private jurisdictions: Jurisdiction[] = []

  constructor(private readonly tenantResolver?: TenantResolver) {}

  private live(org: string) {
    return this.permits.filter((p) => p.organizationId === org && !p.deletedAt)
  }

  async list(input: PermitListInput): Promise<Permit[]> {
    const v = PermitListInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    return this.live(v.organizationId).filter((p) =>
      (!v.propertyId || p.propertyId === v.propertyId)
      && (!v.status || p.status === v.status)
      && (!v.workOrderId || p.workOrderIds.includes(v.workOrderId))
      && (!v.expiringBefore || (p.expiresAt !== null && p.expiresAt <= v.expiringBefore)))
  }

  async get(id: string, organizationId: string): Promise<Permit | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    return this.live(organizationId).find((p) => p.id === id) ?? null
  }

  async create(input: PermitCreateInput): Promise<Permit> {
    const v = PermitCreateInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    const row: Permit = {
      id: globalThis.crypto.randomUUID(),
      organizationId: v.organizationId,
      propertyId: v.propertyId,
      jurisdictionId: v.jurisdictionId ?? null,
      jurisdictionOther: v.jurisdictionOther ?? null,
      permitNumber: v.permitNumber ?? null,
      kind: v.kind ?? 'building',
      status: v.status ?? 'draft',
      appliedAt: v.appliedAt ?? null,
      issuedAt: v.issuedAt ?? null,
      expiresAt: v.expiresAt ?? null,
      notes: v.notes ?? null,
      workOrderIds: [...new Set(v.workOrderIds)],
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
    }
    const err = validatePermitState(row)
    if (err) throw new Error(err)
    if (row.jurisdictionId && !this.jurisdictions.some((j) => j.id === row.jurisdictionId && !j.deletedAt)) throw new Error('Invalid permit: jurisdiction not found')
    this.permits.push(row)
    return row
  }

  async update(input: PermitUpdateInput): Promise<Permit> {
    const v = PermitUpdateInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    const row = this.live(v.organizationId).find((p) => p.id === v.id)
    if (!row) throw new Error('Permit not found')
    const next = { ...row }
    for (const k of ['jurisdictionId', 'jurisdictionOther', 'permitNumber', 'kind', 'status', 'appliedAt', 'issuedAt', 'expiresAt', 'notes'] as const) {
      if (v[k] !== undefined) (next as Record<string, unknown>)[k] = v[k]
    }
    const err = validatePermitState(next)
    if (err) throw new Error(err)
    Object.assign(row, next, { updatedAt: now() })
    return row
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    const row = await this.get(id, organizationId)
    if (!row) throw new Error('Permit not found')
    row.deletedAt = now()
  }

  async linkWorkOrder(input: { organizationId: string, permitId: string, workOrderId: string }): Promise<Permit> {
    const row = await this.get(input.permitId, input.organizationId)
    if (!row) throw new Error('Permit not found')
    if (!row.workOrderIds.includes(input.workOrderId)) row.workOrderIds.push(input.workOrderId)
    return row
  }

  async unlinkWorkOrder(input: { organizationId: string, permitId: string, workOrderId: string }): Promise<Permit> {
    const row = await this.get(input.permitId, input.organizationId)
    if (!row) throw new Error('Permit not found')
    row.workOrderIds = row.workOrderIds.filter((w) => w !== input.workOrderId)
    return row
  }

  async listJurisdictions(organizationId: string): Promise<Jurisdiction[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return this.jurisdictions.filter((j) => j.organizationId === organizationId && !j.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
  }

  async upsertJurisdiction(input: { organizationId: string, id?: string, name: string, code?: string | null }): Promise<Jurisdiction> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const name = input.name?.trim()
    if (!name || name.length > 160) throw new Error('Invalid jurisdiction: name is required (max 160)')
    const live = await this.listJurisdictions(input.organizationId)
    const clash = live.find((j) => j.name === name)
    if (clash && clash.id !== input.id) throw new Error(`Invalid jurisdiction: "${name}" already exists`)
    if (input.id) {
      const row = live.find((j) => j.id === input.id)
      if (!row) throw new Error('Jurisdiction not found')
      Object.assign(row, { name, code: input.code ?? null, updatedAt: now() })
      return row
    }
    const row: Jurisdiction = { id: globalThis.crypto.randomUUID(), organizationId: input.organizationId, name, code: input.code ?? null, createdAt: now(), updatedAt: now(), deletedAt: null }
    this.jurisdictions.push(row)
    return row
  }

  async deleteJurisdiction(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    if (this.live(organizationId).some((p) => p.jurisdictionId === id)) throw new Error('Invalid delete: permits still reference this jurisdiction')
    const row = this.jurisdictions.find((j) => j.id === id && j.organizationId === organizationId && !j.deletedAt)
    if (!row) throw new Error('Jurisdiction not found')
    row.deletedAt = now()
  }
}

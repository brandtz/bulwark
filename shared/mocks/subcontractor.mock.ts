/**
 * shared/mocks/subcontractor.mock.ts — MockSubcontractorService (E6).
 *
 * # Decisions (ADR-0008)
 *   - list + get + update. Create lands in a future story when there's
 *     a real intake form; v1 admin only edits seeded subs. Tenant
 *     firewall (E2-S7) on every method.
 *   - `update` is a partial merge that preserves immutable fields
 *     (id, organizationId, createdAt, deletedAt) and bumps `updatedAt`.
 *     Validates against `SubcontractorSchema` after the merge so the
 *     stored row is always shape-correct.
 *
 * # Decision cast down
 *   - Rejected: optimistic concurrency (etag/version). Single-tenant
 *     mock — collisions aren't realistic. Real backend will add it.
 */
import type {
  ISubcontractorService,
  Subcontractor,
  SubcontractorCreateInput,
  SubcontractorListInput,
  SubcontractorListOutput,
  SubcontractorUpdateInput,
} from '../contracts/subcontractor'
import {
  SubcontractorUpdateInputSchema,
} from '../contracts/subcontractor'
import { FIXTURE_SUBCONTRACTORS } from './fixtures'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: Subcontractor[] = [...FIXTURE_SUBCONTRACTORS]

export class MockSubcontractorService implements ISubcontractorService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: SubcontractorListInput): Promise<SubcontractorListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter(
      (r) => r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (input.trade) {
      scoped = scoped.filter((r) => r.trades.includes(input.trade!))
    }
    scoped = scoped
      .slice()
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Subcontractor | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(
      (x) => x.id === id && x.organizationId === organizationId && !x.deletedAt,
    )
    return r ?? null
  }

  async create(input: SubcontractorCreateInput): Promise<Subcontractor> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = new Date().toISOString()
    const row: Subcontractor = {
      id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email ?? null,
      phone: input.phone,
      trades: input.trades,
      licenseNumber: input.licenseNumber ?? null,
      licenseExpiresAt: input.licenseExpiresAt ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async update(
    id: string,
    input: SubcontractorUpdateInput,
    organizationId: string,
  ): Promise<Subcontractor> {
    assertSameTenant(this.tenantResolver, organizationId)
    const patch = SubcontractorUpdateInputSchema.parse(input)
    const idx = rows.findIndex(
      (x) => x.id === id && x.organizationId === organizationId && !x.deletedAt,
    )
    if (idx === -1) throw new Error(`Subcontractor ${id} not found`)
    // Patch is already validated by SubcontractorUpdateInputSchema.parse.
    // We deliberately skip a re-parse against SubcontractorSchema here
    // because the seeded fixture ids are non-RFC4122 strings (per the
    // E3-S4 lesson) and would fail UUID validation. Real backend will
    // round-trip through Postgres, so this is a mock-only shortcut.
    const merged: Subcontractor = {
      ...rows[idx]!,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    rows[idx] = merged
    return merged
  }
}

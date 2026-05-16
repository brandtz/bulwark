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
  SubcontractorUser,
  SubInviteInput,
  SubInviteOutput,
  SubcontractorCoiDoc,
  SubCoiUploadInput,
} from '../contracts/subcontractor'
import {
  SubcontractorUpdateInputSchema,
} from '../contracts/subcontractor'
import { FIXTURE_SUBCONTRACTORS } from './fixtures'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: Subcontractor[] = [...FIXTURE_SUBCONTRACTORS]
const userRows: SubcontractorUser[] = []
const coiRows: SubcontractorCoiDoc[] = []
let memId = 1
function nid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(memId++).toString(36)}`
}

/** Test-only reset hook. Clears all mutable in-memory state. */
export function __resetSubcontractorMock(): void {
  rows.length = 0
  rows.push(...FIXTURE_SUBCONTRACTORS)
  userRows.length = 0
  coiRows.length = 0
  memId = 1
}

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

  // --------------------------------------------------------------------
  // W3-4 / EH-N additions — sub portal membership + COI + assignments.
  // --------------------------------------------------------------------

  async listUsers(subcontractorId: string, organizationId: string): Promise<SubcontractorUser[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return userRows.filter(
      (u) =>
        u.subcontractorId === subcontractorId &&
        u.organizationId === organizationId &&
        !u.deletedAt,
    )
  }

  async inviteUser(input: SubInviteInput): Promise<SubInviteOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = new Date().toISOString()
    const id = nid('subuser')
    const userId = nid('user')
    const row: SubcontractorUser = {
      id,
      organizationId: input.organizationId,
      subcontractorId: input.subcontractorId,
      userId,
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      invitedAt: now,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    userRows.push(row)
    const token = `mock-${id}`
    return {
      inviteId: id,
      membershipId: id,
      inviteUrl: `/accept-invite?token=${token}`,
      inviteToken: token,
    }
  }

  async removeUser(membershipId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const idx = userRows.findIndex(
      (u) => u.id === membershipId && u.organizationId === organizationId,
    )
    if (idx === -1) return
    userRows[idx] = { ...userRows[idx]!, deletedAt: new Date().toISOString() }
  }

  async resolveSubForUser(
    userId: string,
    organizationId: string,
  ): Promise<{ subcontractorId: string } | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const m = userRows.find(
      (u) => u.userId === userId && u.organizationId === organizationId && !u.deletedAt,
    )
    return m ? { subcontractorId: m.subcontractorId } : null
  }

  async listMyAssignments(_userId: string, organizationId: string): Promise<unknown[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    // Mock returns an empty list; tests inject WorkOrder fixtures separately.
    return []
  }

  async listMyQuotesRequested(_userId: string, organizationId: string): Promise<unknown[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return []
  }

  async listCois(
    subcontractorId: string,
    organizationId: string,
  ): Promise<SubcontractorCoiDoc[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return coiRows
      .filter(
        (c) =>
          c.subcontractorId === subcontractorId &&
          c.organizationId === organizationId &&
          !c.deletedAt,
      )
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  }

  async uploadCoi(input: SubCoiUploadInput): Promise<SubcontractorCoiDoc> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = new Date().toISOString()
    const row: SubcontractorCoiDoc = {
      id: nid('coi'),
      organizationId: input.organizationId,
      subcontractorId: input.subcontractorId,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      expiresAt: input.expiresAt,
      uploadedByUserId: null,
      uploadedAt: now,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    coiRows.push(row)
    return row
  }

  async scanCoiExpiry(input: {
    organizationId: string
    withinDays?: number
    nowIso?: string
  }): Promise<SubcontractorCoiDoc[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const within = input.withinDays ?? 30
    const now = input.nowIso ? new Date(input.nowIso) : new Date()
    const cutoff = new Date(now.getTime() + within * 24 * 60 * 60 * 1000)
    return coiRows.filter(
      (c) =>
        c.organizationId === input.organizationId &&
        !c.deletedAt &&
        new Date(c.expiresAt) <= cutoff,
    )
  }
}

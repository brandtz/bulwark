/**
 * shared/mocks/program.mock.ts — MockProgramService (Wave 1A / EH-A / ADR-0013).
 *
 * # Decisions (ADR-0004, ADR-0008, ADR-0013)
 *   - Module-level `rows`/`memberships` arrays so the singleton service
 *     instance produced by the factory shares mutation state across the
 *     whole request — same pattern as MockPropertyService.
 *   - Seeded with ONE builtin Wildfire Retrofit program per demo org
 *     (Bulwark Demo Co. + Acme Restoration). The slug is identical
 *     across orgs to prove the `(orgId, slug)` uniqueness model — two
 *     different orgs can both own `wildfire-retrofit`.
 *   - Tenant firewall (E2-S7) on every method — same pattern as every
 *     other domain mock.
 *   - Builtin programs reject `softDelete` and reject `slug`/`kind`
 *     edits via the update contract (the update schema omits those
 *     fields, and the service tightens the check).
 *   - We deliberately SKIP `ProgramSchema.parse(...)` on the seed rows
 *     (E3-S4 fixture-id lesson: the shared `mk()` helper produces
 *     non-RFC4122 ids that the strict UUID schema would reject). Real
 *     backend round-trips through Postgres which generates proper UUIDs.
 *
 * # Decision cast down
 *   - Rejected: seeding a custom program (e.g. "Roof Replacement") in
 *     the fixtures. The admin-flow Playwright spec creates one as part
 *     of the test path; seeding it would mask creation regressions.
 */
import type {
  IProgramService,
  Program,
  ProgramAssignInput,
  ProgramCreateInput,
  ProgramEntityType,
  ProgramListInput,
  ProgramListOutput,
  ProgramMembership,
  ProgramUnassignInput,
  ProgramUpdateInput,
} from '../contracts/program'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2 } from './fixtures'
import { assertSameTenant, type TenantResolver } from './tenant'

const NOW = '2026-05-14T20:00:00.000Z'

/** Build a deterministic UUID-ish id from a slug — mirrors fixtures.ts. */
const mk = (slug: string): string => {
  const hex = (slug.replace(/[^a-z0-9]/gi, '') + '00000000000000000000000000000000').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function seededWildfire(orgId: string, slugPrefix: string): Program {
  return {
    id: mk(`program-wildfire-${slugPrefix}`),
    organizationId: orgId,
    slug: 'wildfire-retrofit',
    name: 'Wildfire Retrofit',
    kind: 'inspection_program',
    description:
      'Oregon WUI defensible-space + ignition-resistant retrofit. Bulwark\'s inaugural inspection program.',
    color: '#FF6B35',
    icon: 'flame',
    isBuiltin: true,
    isActive: true,
    sortOrder: 0,
    inspectionTemplateId: null,
    standardSetId: null,
    complianceDocTemplateId: null,
    defaultTradeSlots: [
      { tradeSlug: 'roofing', quantity: 1 },
      { tradeSlug: 'siding', quantity: 1 },
      { tradeSlug: 'eaves_vents', quantity: 1 },
      { tradeSlug: 'defensible_space', quantity: 1 },
    ],
    pricingDefaults: { markupBps: 1500, taxBps: 0, quoteExpiryDays: 30 },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  }
}

const rows: Program[] = [
  seededWildfire(FIXTURE_ORG_ID, 'bulwark-demo'),
  seededWildfire(FIXTURE_ORG_ID_2, 'acme-restoration'),
]
const memberships: ProgramMembership[] = []

const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockProgramService implements IProgramService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: ProgramListInput): Promise<ProgramListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter(
      (r) => r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (!input.includeInactive) scoped = scoped.filter((r) => r.isActive)
    if (input.kind) scoped = scoped.filter((r) => r.kind === input.kind)
    if (input.search) {
      const q = input.search.toLowerCase()
      scoped = scoped.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q),
      )
    }
    scoped = scoped.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Program | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find((x) => x.id === id && x.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  async create(input: ProgramCreateInput): Promise<Program> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const dup = rows.find(
      (r) =>
        r.organizationId === input.organizationId &&
        r.slug === input.slug &&
        !r.deletedAt,
    )
    if (dup) throw new Error(`Program slug already exists: ${input.slug}`)
    const now = nowIso()
    const row: Program = {
      id: newId(),
      organizationId: input.organizationId,
      slug: input.slug,
      name: input.name,
      kind: input.kind,
      description: input.description ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      isBuiltin: false,
      isActive: true,
      sortOrder: input.sortOrder ?? rows.length,
      inspectionTemplateId: null,
      standardSetId: null,
      complianceDocTemplateId: null,
      defaultTradeSlots: input.defaultTradeSlots ?? null,
      pricingDefaults: input.pricingDefaults ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async update(input: ProgramUpdateInput): Promise<Program> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const r = rows.find(
      (x) => x.id === input.id && x.organizationId === input.organizationId && !x.deletedAt,
    )
    if (!r) throw new Error('Program not found')
    if (input.name !== undefined) r.name = input.name
    if (input.description !== undefined) r.description = input.description
    if (input.color !== undefined) r.color = input.color ?? null
    if (input.icon !== undefined) r.icon = input.icon ?? null
    if (input.isActive !== undefined) r.isActive = input.isActive
    if (input.sortOrder !== undefined) r.sortOrder = input.sortOrder
    if (input.defaultTradeSlots !== undefined) r.defaultTradeSlots = input.defaultTradeSlots
    if (input.pricingDefaults !== undefined) r.pricingDefaults = input.pricingDefaults
    r.updatedAt = nowIso()
    return r
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find((x) => x.id === id && x.organizationId === organizationId && !x.deletedAt)
    if (!r) throw new Error('Program not found')
    if (r.isBuiltin) {
      throw new Error('Built-in programs cannot be deleted; deactivate them instead.')
    }
    r.deletedAt = nowIso()
    r.updatedAt = r.deletedAt
  }

  async assignToEntity(input: ProgramAssignInput): Promise<ProgramMembership> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const program = rows.find(
      (x) => x.id === input.programId && x.organizationId === input.organizationId && !x.deletedAt,
    )
    if (!program) throw new Error('Program not found')
    const existing = memberships.find(
      (m) =>
        m.organizationId === input.organizationId &&
        m.programId === input.programId &&
        m.entityType === input.entityType &&
        m.entityId === input.entityId,
    )
    if (existing) return existing
    const now = nowIso()
    const row: ProgramMembership = {
      id: newId(),
      organizationId: input.organizationId,
      programId: input.programId,
      entityType: input.entityType,
      entityId: input.entityId,
      assignedAt: now,
      assignedByUserId: this.tenantResolver?.()?.userId ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    memberships.push(row)
    return row
  }

  async unassignFromEntity(input: ProgramUnassignInput): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const idx = memberships.findIndex(
      (m) =>
        m.organizationId === input.organizationId &&
        m.programId === input.programId &&
        m.entityType === input.entityType &&
        m.entityId === input.entityId,
    )
    if (idx >= 0) memberships.splice(idx, 1)
  }

  async listMembershipsFor(
    input: { organizationId: string; entityType: ProgramEntityType; entityId: string },
  ): Promise<ProgramMembership[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return memberships.filter(
      (m) =>
        m.organizationId === input.organizationId &&
        m.entityType === input.entityType &&
        m.entityId === input.entityId,
    )
  }

  async listEntitiesForProgram(
    input: { organizationId: string; programId: string; entityType: ProgramEntityType },
  ): Promise<ProgramMembership[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return memberships.filter(
      (m) =>
        m.organizationId === input.organizationId &&
        m.programId === input.programId &&
        m.entityType === input.entityType,
    )
  }
}

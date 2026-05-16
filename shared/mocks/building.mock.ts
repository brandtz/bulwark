/**
 * shared/mocks/building.mock.ts — MockBuildingService (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008)
 *   - Two in-memory stores: buildings + sections. Tenant firewall calls
 *     guard every method.
 *   - `reorderSections` rewrites every section's `sortOrder` to match
 *     the `orderedIds` list index. The service guards against drift by
 *     refusing the call if `orderedIds` doesn't enumerate all
 *     non-deleted sections of the building.
 *   - Soft delete only — historical inspection responses reference
 *     section ids and must keep resolving.
 */
import type {
  Building,
  BuildingCreateInput,
  BuildingSection,
  BuildingSectionCreateInput,
  BuildingSectionUpdateInput,
  BuildingUpdateInput,
  IBuildingService,
} from '../contracts/building'
import { assertSameTenant, type TenantResolver } from './tenant'

const buildings: Building[] = []
const sections: BuildingSection[] = []
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockBuildingService implements IBuildingService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(organizationId: string): Promise<Building[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return buildings.filter(b => b.organizationId === organizationId && !b.deletedAt)
  }

  async listForProperty(propertyId: string, organizationId: string): Promise<Building[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return buildings
      .filter(b => b.organizationId === organizationId && b.propertyId === propertyId && !b.deletedAt)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
  }

  async get(id: string, organizationId: string): Promise<Building | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = buildings.find(b => b.id === id && b.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  async create(input: BuildingCreateInput): Promise<Building> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = nowIso()
    const row: Building = {
      id: newId(),
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      name: input.name,
      kind: input.kind ?? 'house',
      yearBuilt: input.yearBuilt ?? null,
      squareFeet: input.squareFeet ?? null,
      stories: input.stories ?? null,
      constructionType: input.constructionType ?? null,
      roofMaterial: input.roofMaterial ?? null,
      sidingMaterial: input.sidingMaterial ?? null,
      notes: input.notes ?? null,
      sortOrder: input.sortOrder ?? buildings.filter(b => b.propertyId === input.propertyId && !b.deletedAt).length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    buildings.push(row)
    return row
  }

  async update(input: BuildingUpdateInput): Promise<Building> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const r = buildings.find(b => b.id === input.id && b.organizationId === input.organizationId)
    if (!r || r.deletedAt) throw new Error('Building not found')
    if (input.name !== undefined) r.name = input.name
    if (input.kind !== undefined) r.kind = input.kind
    if (input.yearBuilt !== undefined) r.yearBuilt = input.yearBuilt ?? null
    if (input.squareFeet !== undefined) r.squareFeet = input.squareFeet ?? null
    if (input.stories !== undefined) r.stories = input.stories ?? null
    if (input.constructionType !== undefined) r.constructionType = input.constructionType ?? null
    if (input.roofMaterial !== undefined) r.roofMaterial = input.roofMaterial ?? null
    if (input.sidingMaterial !== undefined) r.sidingMaterial = input.sidingMaterial ?? null
    if (input.notes !== undefined) r.notes = input.notes ?? null
    if (input.sortOrder !== undefined) r.sortOrder = input.sortOrder
    r.updatedAt = nowIso()
    return r
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = buildings.find(b => b.id === id && b.organizationId === organizationId)
    if (!r) throw new Error('Building not found')
    r.deletedAt = nowIso()
    r.updatedAt = r.deletedAt
  }

  async listSections(buildingId: string, organizationId: string): Promise<BuildingSection[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return sections
      .filter(s => s.organizationId === organizationId && s.buildingId === buildingId && !s.deletedAt)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
  }

  async createSection(input: BuildingSectionCreateInput): Promise<BuildingSection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = nowIso()
    const row: BuildingSection = {
      id: newId(),
      organizationId: input.organizationId,
      buildingId: input.buildingId,
      label: input.label,
      kind: input.kind ?? 'other',
      squareFeet: input.squareFeet ?? null,
      notes: input.notes ?? null,
      sortOrder: input.sortOrder ?? sections.filter(s => s.buildingId === input.buildingId && !s.deletedAt).length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    sections.push(row)
    return row
  }

  async updateSection(input: BuildingSectionUpdateInput): Promise<BuildingSection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const r = sections.find(s => s.id === input.id && s.organizationId === input.organizationId)
    if (!r || r.deletedAt) throw new Error('Section not found')
    if (input.label !== undefined) r.label = input.label
    if (input.kind !== undefined) r.kind = input.kind
    if (input.squareFeet !== undefined) r.squareFeet = input.squareFeet ?? null
    if (input.notes !== undefined) r.notes = input.notes ?? null
    if (input.sortOrder !== undefined) r.sortOrder = input.sortOrder
    r.updatedAt = nowIso()
    return r
  }

  async softDeleteSection(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = sections.find(s => s.id === id && s.organizationId === organizationId)
    if (!r) throw new Error('Section not found')
    r.deletedAt = nowIso()
    r.updatedAt = r.deletedAt
  }

  async reorderSections(
    buildingId: string,
    orderedIds: string[],
    organizationId: string,
  ): Promise<BuildingSection[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const live = sections.filter(
      s => s.organizationId === organizationId && s.buildingId === buildingId && !s.deletedAt,
    )
    if (live.length !== orderedIds.length || !live.every(s => orderedIds.includes(s.id))) {
      throw new Error('reorderSections: orderedIds must enumerate every active section of the building')
    }
    const now = nowIso()
    orderedIds.forEach((id, idx) => {
      const r = live.find(s => s.id === id)!
      r.sortOrder = idx
      r.updatedAt = now
    })
    return this.listSections(buildingId, organizationId)
  }
}

/** Test-only: reset stores. */
export function __resetBuildingMock(): void {
  buildings.length = 0
  sections.length = 0
}

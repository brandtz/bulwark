/**
 * shared/mocks/property-photo.mock.ts — MockPropertyPhotoService (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008)
 *   - Accepts either a data URL or a `local://photos/<uuid>` stub URL.
 *     Persists the string as-is. W3-1 swaps the entry point for a
 *     sealed-secret S3/R2 signed-URL upload — see TODO at `create()`.
 *   - `reorder` follows the building.sections pattern: caller submits
 *     every active photo id of the property in the desired order.
 */
import type {
  IPropertyPhotoService,
  PropertyPhoto,
  PropertyPhotoCreateInput,
  PropertyPhotoUpdateInput,
} from '../contracts/property-photo'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: PropertyPhoto[] = []
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockPropertyPhotoService implements IPropertyPhotoService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(organizationId: string): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows.filter(r => r.organizationId === organizationId && !r.deletedAt)
  }

  async listForProperty(propertyId: string, organizationId: string): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows
      .filter(r => r.organizationId === organizationId && r.propertyId === propertyId && !r.deletedAt)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
  }

  async listForBuilding(buildingId: string, organizationId: string): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows
      .filter(r => r.organizationId === organizationId && r.buildingId === buildingId && !r.deletedAt)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  async listForSection(sectionId: string, organizationId: string): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows
      .filter(r => r.organizationId === organizationId && r.sectionId === sectionId && !r.deletedAt)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  async get(id: string, organizationId: string): Promise<PropertyPhoto | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  // TODO(W3-1): swap for sealed-secret S3/R2 signed-URL upload. The contract
  // accepts a string URL either way; the W2-1 stub just persists whatever
  // the UI submits (data URL or `local://photos/<uuid>`).
  async create(input: PropertyPhotoCreateInput): Promise<PropertyPhoto> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = nowIso()
    const row: PropertyPhoto = {
      id: newId(),
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      buildingId: input.buildingId ?? null,
      sectionId: input.sectionId ?? null,
      url: input.url,
      thumbnailUrl: input.thumbnailUrl ?? null,
      caption: input.caption ?? null,
      takenAt: input.takenAt ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
      sortOrder: input.sortOrder ?? rows.filter(r =>
        r.propertyId === input.propertyId && !r.deletedAt,
      ).length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async update(input: PropertyPhotoUpdateInput): Promise<PropertyPhoto> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const r = rows.find(x => x.id === input.id && x.organizationId === input.organizationId)
    if (!r || r.deletedAt) throw new Error('Photo not found')
    if (input.buildingId !== undefined) r.buildingId = input.buildingId ?? null
    if (input.sectionId !== undefined) r.sectionId = input.sectionId ?? null
    if (input.caption !== undefined) r.caption = input.caption ?? null
    if (input.thumbnailUrl !== undefined) r.thumbnailUrl = input.thumbnailUrl ?? null
    if (input.takenAt !== undefined) r.takenAt = input.takenAt ?? null
    if (input.sortOrder !== undefined) r.sortOrder = input.sortOrder
    r.updatedAt = nowIso()
    return r
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r) throw new Error('Photo not found')
    r.deletedAt = nowIso()
    r.updatedAt = r.deletedAt
  }

  async reorder(
    propertyId: string,
    orderedIds: string[],
    organizationId: string,
  ): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const live = rows.filter(
      r => r.organizationId === organizationId && r.propertyId === propertyId && !r.deletedAt,
    )
    if (live.length !== orderedIds.length || !live.every(r => orderedIds.includes(r.id))) {
      throw new Error('reorder: orderedIds must enumerate every active photo of the property')
    }
    const now = nowIso()
    orderedIds.forEach((id, idx) => {
      const r = live.find(x => x.id === id)!
      r.sortOrder = idx
      r.updatedAt = now
    })
    return this.listForProperty(propertyId, organizationId)
  }
}

/** Test-only: reset store. */
export function __resetPropertyPhotoMock(): void {
  rows.length = 0
}

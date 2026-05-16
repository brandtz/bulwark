/**
 * server/services/_row-mappers.ts — DB row ↔ contract DTO mappers.
 *
 * # Decisions (ADR-0008)
 *   - Drizzle returns `timestamp` columns as `Date`. Contracts use ISO
 *     strings (per shared/contracts/_shared.ts AuditFieldsSchema). Every
 *     Real service runs its rows through one of these mappers before
 *     handing them back to UI/API code.
 *   - Mappers are dumb. No schema validation here — that's the caller's
 *     job at API boundaries (E11-S4 server route layer).
 */
import type { Property as DbProperty } from '../db/schema/properties'
import type { Client as DbClient } from '../db/schema/clients'
import type { Building as DbBuilding } from '../db/schema/buildings'
import type { BuildingSection as DbBuildingSection } from '../db/schema/building_sections'
import type { Contact as DbContact } from '../db/schema/contacts'
import type { PropertyPhoto as DbPropertyPhoto } from '../db/schema/property_photos'
import type { PropertyAttachment as DbPropertyAttachment } from '../db/schema/property_attachments'
import type { Property } from '../../shared/contracts/property'
import type { Client } from '../../shared/contracts/client'
import type { Building, BuildingSection } from '../../shared/contracts/building'
import type { Contact } from '../../shared/contracts/contact'
import type { PropertyPhoto } from '../../shared/contracts/property-photo'
import type { PropertyAttachment } from '../../shared/contracts/property-attachment'

// shared/contracts/client.ts encodes preferredContact as the literal union
// 'email'|'phone'|'sms'|null. The DB stores it as text.
type Pc = 'email' | 'phone' | 'sms' | null

export function dbPropertyToContract(r: DbProperty): Property {
  return {
    id: r.id,
    organizationId: r.organizationId,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    state: r.state,
    postalCode: r.postalCode,
    clientId: r.clientId,
    status: r.status,
    notes: r.notes,
    // W2-1 / EH-E (ADR-0018). Numeric → number when present; the
    // Drizzle numeric column maps to `string` to preserve precision,
    // we widen to JS number for contract use.
    lotSizeAcres: r.lotSizeAcres === null || r.lotSizeAcres === undefined
      ? null
      : typeof r.lotSizeAcres === 'string' ? Number(r.lotSizeAcres) : r.lotSizeAcres,
    parcelNumber: r.parcelNumber ?? null,
    yearBuilt: r.yearBuilt ?? null,
    accessNotes: r.accessNotes ?? null,
    gateCode: r.gateCode ?? null,
    specialInstructions: r.specialInstructions ?? null,
    primaryContactId: r.primaryContactId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export function dbClientToContract(r: DbClient): Client {
  // We trust the DB but coerce the text column to the union shape; if
  // somehow corrupted we fall through to null.
  const pc: Pc =
    r.preferredContact === 'email' || r.preferredContact === 'phone' || r.preferredContact === 'sms'
      ? r.preferredContact
      : null
  return {
    id: r.id,
    organizationId: r.organizationId,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    preferredContact: pc,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

// ----------------------------------------------------------------------------
// W2-1 / EH-E — property depth row mappers (ADR-0018).
// ----------------------------------------------------------------------------
export function dbBuildingToContract(r: DbBuilding): Building {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    name: r.name,
    kind: r.kind,
    yearBuilt: r.yearBuilt ?? null,
    squareFeet: r.squareFeet ?? null,
    stories: r.stories ?? null,
    constructionType: r.constructionType ?? null,
    roofMaterial: r.roofMaterial ?? null,
    sidingMaterial: r.sidingMaterial ?? null,
    notes: r.notes ?? null,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export function dbBuildingSectionToContract(r: DbBuildingSection): BuildingSection {
  return {
    id: r.id,
    organizationId: r.organizationId,
    buildingId: r.buildingId,
    label: r.label,
    kind: r.kind,
    squareFeet: r.squareFeet ?? null,
    notes: r.notes ?? null,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export function dbContactToContract(r: DbContact): Contact {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId ?? null,
    clientId: r.clientId ?? null,
    kind: r.kind,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email ?? null,
    phone: r.phone ?? null,
    notes: r.notes ?? null,
    isPrimary: r.isPrimary,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export function dbPropertyPhotoToContract(r: DbPropertyPhoto): PropertyPhoto {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    buildingId: r.buildingId ?? null,
    sectionId: r.sectionId ?? null,
    url: r.url,
    thumbnailUrl: r.thumbnailUrl ?? null,
    caption: r.caption ?? null,
    takenAt: r.takenAt ? r.takenAt.toISOString() : null,
    uploadedByUserId: r.uploadedByUserId ?? null,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export function dbPropertyAttachmentToContract(r: DbPropertyAttachment): PropertyAttachment {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    kind: r.kind,
    name: r.name,
    url: r.url,
    uploadedByUserId: r.uploadedByUserId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

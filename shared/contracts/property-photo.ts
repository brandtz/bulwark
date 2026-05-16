/**
 * shared/contracts/property-photo.ts — property photo gallery (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008, ADR-0018)
 *   - A photo always pins to a property. The building and section pins are
 *     optional so legacy "front of house" photos (taken before the
 *     building tree was captured) still have a home.
 *   - `url` accepts either a `data:image/...` URL (browser-pasted upload)
 *     OR a `local://photos/<uuid>` stub for the W2-1 slice. W3-1 swaps
 *     in sealed-secret signed-URL S3/R2 uploads; the contract stays
 *     identical from the UI's perspective.
 *   - `takenAt` is distinct from `createdAt` because field crews want
 *     to sort by EXIF capture timestamp, which can be hours or weeks
 *     before the upload event.
 *
 * # Decision cast down
 *   - Storing the binary in Postgres. Rejected for the obvious reason —
 *     binary in the row store explodes WAL volume and breaks logical
 *     replication.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const PropertyPhotoSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  buildingId: UuidSchema.nullable(),
  sectionId: UuidSchema.nullable(),
  url: z.string().min(1),
  thumbnailUrl: z.string().nullable(),
  caption: z.string().nullable(),
  takenAt: z.string().datetime().nullable(),
  uploadedByUserId: UuidSchema.nullable(),
  sortOrder: z.number().int(),
}).merge(AuditFieldsSchema)
export type PropertyPhoto = z.infer<typeof PropertyPhotoSchema>

export const PropertyPhotoCreateInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  buildingId: UuidSchema.nullable().optional(),
  sectionId: UuidSchema.nullable().optional(),
  url: z.string().min(1),
  thumbnailUrl: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  takenAt: z.string().datetime().nullable().optional(),
  uploadedByUserId: UuidSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
})
export type PropertyPhotoCreateInput = z.infer<typeof PropertyPhotoCreateInputSchema>

export const PropertyPhotoUpdateInputSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  buildingId: UuidSchema.nullable().optional(),
  sectionId: UuidSchema.nullable().optional(),
  caption: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  takenAt: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().optional(),
})
export type PropertyPhotoUpdateInput = z.infer<typeof PropertyPhotoUpdateInputSchema>

export interface IPropertyPhotoService {
  list(organizationId: string): Promise<PropertyPhoto[]>
  listForProperty(propertyId: string, organizationId: string): Promise<PropertyPhoto[]>
  listForBuilding(buildingId: string, organizationId: string): Promise<PropertyPhoto[]>
  listForSection(sectionId: string, organizationId: string): Promise<PropertyPhoto[]>
  get(id: string, organizationId: string): Promise<PropertyPhoto | null>
  create(input: PropertyPhotoCreateInput): Promise<PropertyPhoto>
  update(input: PropertyPhotoUpdateInput): Promise<PropertyPhoto>
  softDelete(id: string, organizationId: string): Promise<void>
  /**
   * Persist a new photo order within a property. `orderedIds` is every
   * non-deleted photo for that property in the desired order.
   */
  reorder(
    propertyId: string,
    orderedIds: string[],
    organizationId: string,
  ): Promise<PropertyPhoto[]>
}

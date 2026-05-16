/**
 * shared/contracts/building.ts — physical structures + sub-sections attached
 * to a property (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008, ADR-0018)
 *   - A property owns many buildings (main house, ADU, garage, barn, shop).
 *     Real GC upgrades scope to a specific structure, not the parcel, so
 *     the contract surfaces it explicitly rather than tucking it under a
 *     property metadata blob.
 *   - `kind` is a free-form `string` (not a Zod enum) because admins can
 *     introduce new building kinds via the label registry without a
 *     migration. The known taxonomy is kept in `BUILDING_KIND_LABEL` for
 *     UI default copy; service create/update accept the wider type to
 *     keep the seam.
 *   - Sections are the next granularity down (rooms, exterior faces,
 *     decks). Inspections, photos, and quote line items can pin to a
 *     section, which is why their service exposes its own list/reorder
 *     surface separate from buildings.
 *   - Reorder for sections uses an explicit `reorderSections(buildingId,
 *     orderedIds[])` call rather than emitting per-row `sortOrder`
 *     updates. Single round-trip, no drift if two siblings reorder
 *     concurrently.
 *
 * # Decision cast down
 *   - Inlining sections inside the building entity. Rejected — the
 *     section list grows independently and a single fat shape complicates
 *     paginated list endpoints.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

/** Known building kinds. Admins may override via labels; service accepts any string. */
export const BUILDING_KIND_LABEL: Record<string, string> = {
  house: 'House',
  adu: 'ADU',
  garage: 'Garage',
  barn: 'Barn',
  shop: 'Shop',
  other: 'Other',
}

export const BuildingSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  name: z.string().min(1),
  kind: z.string().min(1),
  yearBuilt: z.number().int().nullable(),
  squareFeet: z.number().int().nullable(),
  stories: z.number().int().nullable(),
  constructionType: z.string().nullable(),
  roofMaterial: z.string().nullable(),
  sidingMaterial: z.string().nullable(),
  notes: z.string().nullable(),
  sortOrder: z.number().int(),
}).merge(AuditFieldsSchema)
export type Building = z.infer<typeof BuildingSchema>

export const BuildingCreateInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  name: z.string().min(1),
  kind: z.string().min(1).default('house'),
  yearBuilt: z.number().int().nullable().optional(),
  squareFeet: z.number().int().nullable().optional(),
  stories: z.number().int().nullable().optional(),
  constructionType: z.string().nullable().optional(),
  roofMaterial: z.string().nullable().optional(),
  sidingMaterial: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})
export type BuildingCreateInput = z.infer<typeof BuildingCreateInputSchema>

export const BuildingUpdateInputSchema = BuildingCreateInputSchema.partial().extend({
  id: UuidSchema,
  organizationId: UuidSchema,
})
export type BuildingUpdateInput = z.infer<typeof BuildingUpdateInputSchema>

/** Known section kinds (text in DB). */
export const BUILDING_SECTION_KIND_LABEL: Record<string, string> = {
  room: 'Room',
  exterior_face: 'Exterior face',
  deck: 'Deck',
  roof: 'Roof',
  other: 'Other',
}

export const BuildingSectionSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  buildingId: UuidSchema,
  label: z.string().min(1),
  kind: z.string().min(1),
  squareFeet: z.number().int().nullable(),
  notes: z.string().nullable(),
  sortOrder: z.number().int(),
}).merge(AuditFieldsSchema)
export type BuildingSection = z.infer<typeof BuildingSectionSchema>

export const BuildingSectionCreateInputSchema = z.object({
  organizationId: UuidSchema,
  buildingId: UuidSchema,
  label: z.string().min(1),
  kind: z.string().min(1).default('other'),
  squareFeet: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})
export type BuildingSectionCreateInput = z.infer<typeof BuildingSectionCreateInputSchema>

export const BuildingSectionUpdateInputSchema =
  BuildingSectionCreateInputSchema.partial().extend({
    id: UuidSchema,
    organizationId: UuidSchema,
  })
export type BuildingSectionUpdateInput = z.infer<typeof BuildingSectionUpdateInputSchema>

export interface IBuildingService {
  list(organizationId: string): Promise<Building[]>
  listForProperty(propertyId: string, organizationId: string): Promise<Building[]>
  get(id: string, organizationId: string): Promise<Building | null>
  create(input: BuildingCreateInput): Promise<Building>
  update(input: BuildingUpdateInput): Promise<Building>
  softDelete(id: string, organizationId: string): Promise<void>

  listSections(buildingId: string, organizationId: string): Promise<BuildingSection[]>
  createSection(input: BuildingSectionCreateInput): Promise<BuildingSection>
  updateSection(input: BuildingSectionUpdateInput): Promise<BuildingSection>
  softDeleteSection(id: string, organizationId: string): Promise<void>
  /**
   * Persist a new section order. `orderedIds` lists every non-deleted
   * section of the building in the desired order; the service writes
   * back `sortOrder = index` in one transaction.
   */
  reorderSections(
    buildingId: string,
    orderedIds: string[],
    organizationId: string,
  ): Promise<BuildingSection[]>
}

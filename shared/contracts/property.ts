/**
 * shared/contracts/property.ts — properties domain.
 *
 * Property is the central entity (every assessment / quote / work order ties
 * back here). Status = the kanban column on /admin/pipeline (E3-S1).
 */
import { z } from 'zod'
import { AuditFieldsSchema, ListOutputSchema, PaginationInputSchema, UuidSchema } from './_shared'
import { BuildingSchema, BuildingSectionSchema, type Building, type BuildingSection } from './building'
import { ContactSchema, type Contact } from './contact'

export const PropertyStatusSchema = z.enum([
  'lead',
  'scheduled',
  'assessed',
  'quoted',
  'accepted',
  'in_progress',
  'completed',
  'compliance_pending',
  'compliance_complete',
  'invoiced',
  'paid',
  'on_hold',
  'cancelled',
])
export type PropertyStatus = z.infer<typeof PropertyStatusSchema>

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  lead: 'Lead',
  scheduled: 'Scheduled',
  assessed: 'Assessed',
  quoted: 'Quoted',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  compliance_pending: 'Compliance pending',
  compliance_complete: 'Compliance complete',
  invoiced: 'Invoiced',
  paid: 'Paid',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
}

export const PropertySchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  addressLine1: z.string().min(1),
  addressLine2: z.string().nullable(),
  city: z.string().min(1),
  state: z.string().length(2),
  postalCode: z.string().min(1),
  clientId: UuidSchema.nullable(),
  status: PropertyStatusSchema,
  notes: z.string().nullable(),
  // W2-1 / EH-E — richer property metadata (ADR-0018). All nullable so
  // legacy rows stay valid; UI surfaces blanks as "—".
  lotSizeAcres: z.number().nullable(),
  parcelNumber: z.string().nullable(),
  yearBuilt: z.number().int().nullable(),
  accessNotes: z.string().nullable(),
  gateCode: z.string().nullable(),
  specialInstructions: z.string().nullable(),
  primaryContactId: UuidSchema.nullable(),
}).merge(AuditFieldsSchema)
export type Property = z.infer<typeof PropertySchema>

export const PropertyCreateInputSchema = PropertySchema.pick({
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  clientId: true,
  notes: true,
  lotSizeAcres: true,
  parcelNumber: true,
  yearBuilt: true,
  accessNotes: true,
  gateCode: true,
  specialInstructions: true,
  primaryContactId: true,
}).partial({
  lotSizeAcres: true,
  parcelNumber: true,
  yearBuilt: true,
  accessNotes: true,
  gateCode: true,
  specialInstructions: true,
  primaryContactId: true,
}).extend({
  organizationId: UuidSchema,
})
export type PropertyCreateInput = z.infer<typeof PropertyCreateInputSchema>

export const PropertyUpdateInputSchema = PropertyCreateInputSchema.partial().extend({
  id: UuidSchema,
  organizationId: UuidSchema,
})
export type PropertyUpdateInput = z.infer<typeof PropertyUpdateInputSchema>

export const PropertyListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  status: PropertyStatusSchema.optional(),
  search: z.string().optional(),
})
export type PropertyListInput = z.infer<typeof PropertyListInputSchema>

export const PropertyListOutputSchema = ListOutputSchema(PropertySchema)
export type PropertyListOutput = z.infer<typeof PropertyListOutputSchema>

// W2-1 / EH-E — nested "depth" payload for the property overview screen
// (ADR-0018). One round-trip returns the property, every active building
// with its sections, every contact, and the primary photo URL (if any).
export const BuildingWithSectionsSchema = BuildingSchema.extend({
  sections: z.array(BuildingSectionSchema),
})
export type BuildingWithSections = Building & { sections: BuildingSection[] }

export const PropertyDepthSchema = z.object({
  property: PropertySchema,
  buildings: z.array(BuildingWithSectionsSchema),
  contacts: z.array(ContactSchema),
  primaryPhotoUrl: z.string().nullable(),
})
export type PropertyDepth = {
  property: Property
  buildings: BuildingWithSections[]
  contacts: Contact[]
  primaryPhotoUrl: string | null
}

export interface IPropertyService {
  list(input: PropertyListInput): Promise<PropertyListOutput>
  get(id: string, organizationId: string): Promise<Property | null>
  create(input: PropertyCreateInput): Promise<Property>
  update(input: PropertyUpdateInput): Promise<Property>
  softDelete(id: string, organizationId: string): Promise<void>
  updateStatus(id: string, status: PropertyStatus, organizationId: string): Promise<Property>
  /**
   * W2-1 / EH-E (ADR-0018). One-shot depth fetch for the overview hub.
   * Returns null when the property is missing or soft-deleted.
   */
  getWithDepth(propertyId: string, organizationId: string): Promise<PropertyDepth | null>
}

/**
 * shared/contracts/contact.ts — extra people attached to a property OR client
 * (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008, ADR-0018)
 *   - A `client` row is the single homeowner. In practice a job touches
 *     many people (owner, tenant, property manager, HOA contact,
 *     emergency contact, insurance adjuster, vendor reps). This entity
 *     stores that wider rolodex.
 *   - Either `propertyId` OR `clientId` (or both) may be set. Service
 *     layer enforces "at least one" — the DB schema deliberately leaves
 *     both nullable so future "tenant-wide rolodex" (e.g. permit office
 *     contacts) needs no migration.
 *   - `isPrimary` is a service-enforced singleton per property — calling
 *     `setPrimary(id)` demotes siblings in the same transaction. We
 *     considered a partial unique index but moved the rule into the
 *     service so semantics can evolve (per-kind primary, per-client
 *     primary) without DB churn.
 *
 * # Decision cast down
 *   - One contact row per (person, kind). Rejected — a property manager
 *     who is also the emergency contact has one phone number; deduping
 *     in UI is easier than coalescing rows downstream.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const CONTACT_KIND_LABEL: Record<string, string> = {
  owner: 'Owner',
  tenant: 'Tenant',
  property_manager: 'Property manager',
  hoa: 'HOA',
  emergency: 'Emergency',
  insurance: 'Insurance',
  vendor: 'Vendor',
  other: 'Other',
}

export const ContactSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  propertyId: UuidSchema.nullable(),
  clientId: UuidSchema.nullable(),
  kind: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  isPrimary: z.boolean(),
  sortOrder: z.number().int(),
}).merge(AuditFieldsSchema)
export type Contact = z.infer<typeof ContactSchema>

export const ContactCreateInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema.nullable().optional(),
  clientId: UuidSchema.nullable().optional(),
  kind: z.string().min(1).default('other'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
export type ContactCreateInput = z.infer<typeof ContactCreateInputSchema>

export const ContactUpdateInputSchema = ContactCreateInputSchema.partial().extend({
  id: UuidSchema,
  organizationId: UuidSchema,
})
export type ContactUpdateInput = z.infer<typeof ContactUpdateInputSchema>

export interface IContactService {
  list(organizationId: string): Promise<Contact[]>
  listForProperty(propertyId: string, organizationId: string): Promise<Contact[]>
  listForClient(clientId: string, organizationId: string): Promise<Contact[]>
  get(id: string, organizationId: string): Promise<Contact | null>
  create(input: ContactCreateInput): Promise<Contact>
  update(input: ContactUpdateInput): Promise<Contact>
  softDelete(id: string, organizationId: string): Promise<void>
  /**
   * Mark the contact as primary; demotes any sibling row whose
   * propertyId matches. Throws if the row has no propertyId — the
   * "primary" notion only applies per-property in W2-1.
   */
  setPrimary(id: string, organizationId: string): Promise<Contact>
}

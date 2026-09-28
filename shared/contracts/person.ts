/**
 * shared/contracts/person.ts — org-scoped people (WP-X2, ED-036).
 *
 * # Decisions (ED-036)
 *   - A person exists once per org and can be a contact on many properties;
 *     `contacts` is the join (property, person, kind, isPrimary, isBilling).
 *   - The lowercased primary email is unique per org: `create` with an email
 *     that already belongs to a live person returns 400 (use `findByEmail` /
 *     `attachToProperty` to reuse them) — the dedupe rule the 0021 backfill
 *     applied to existing contacts.
 *   - Portal invites attach to the person (L13 builds on this).
 */
import { z } from 'zod'
import { AuditFieldsSchema, ListOutputSchema, PaginationInputSchema, UuidSchema } from './_shared'

export const PersonSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    firstName: z.string().min(1).max(120),
    lastName: z.string().max(120),
    primaryEmail: z.string().email().nullable(),
    emails: z.array(z.string().email()),
    phones: z.array(z.string().min(3).max(40)),
    notes: z.string().max(4000).nullable(),
  })
  .merge(AuditFieldsSchema)
export type Person = z.infer<typeof PersonSchema>

export const PersonCreateInputSchema = z.object({
  organizationId: UuidSchema,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).default(''),
  emails: z.array(z.string().trim().email()).max(10).default([]),
  phones: z.array(z.string().trim().min(3).max(40)).max(10).default([]),
  notes: z.string().max(4000).nullable().optional(),
})
export type PersonCreateInput = z.input<typeof PersonCreateInputSchema>

export const PersonUpdateInputSchema = PersonCreateInputSchema.partial().extend({
  id: UuidSchema,
  organizationId: UuidSchema,
})
export type PersonUpdateInput = z.input<typeof PersonUpdateInputSchema>

export const PersonListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  /** Matches name or any email / phone (case-insensitive substring). */
  search: z.string().trim().max(120).optional(),
})
export type PersonListInput = z.input<typeof PersonListInputSchema>
export const PersonListOutputSchema = ListOutputSchema(PersonSchema)
export type PersonListOutput = z.infer<typeof PersonListOutputSchema>

export const ContactKindSchema = z.enum(['owner', 'tenant', 'property_manager', 'insurance_agent', 'other'])

export const PersonAttachInputSchema = z.object({
  organizationId: UuidSchema,
  personId: UuidSchema,
  propertyId: UuidSchema,
  kind: z.string().min(1).max(40).default('other'),
  isPrimary: z.boolean().default(false),
  isBilling: z.boolean().default(false),
})
export type PersonAttachInput = z.input<typeof PersonAttachInputSchema>

export interface IPersonService {
  list(input: PersonListInput): Promise<PersonListOutput>
  get(id: string, organizationId: string): Promise<Person | null>
  findByEmail(email: string, organizationId: string): Promise<Person | null>
  create(input: PersonCreateInput): Promise<Person>
  update(input: PersonUpdateInput): Promise<Person>
  softDelete(id: string, organizationId: string): Promise<void>
  /** Link a person to a property as a contact (the ED-036 join row). Returns the contact id. */
  attachToProperty(input: PersonAttachInput): Promise<{ contactId: string }>
  /** Properties this person is a contact on. */
  listProperties(personId: string, organizationId: string): Promise<Array<{ contactId: string, propertyId: string, kind: string, isPrimary: boolean, isBilling: boolean }>>
}

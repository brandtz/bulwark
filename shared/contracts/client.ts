/**
 * shared/contracts/client.ts — homeowners / property owners.
 */
import { z } from 'zod'
import { AuditFieldsSchema, ListOutputSchema, PaginationInputSchema, UuidSchema } from './_shared'

export const ClientSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  fullName: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().min(1),
  preferredContact: z.enum(['email', 'phone', 'sms']).nullable(),
  notes: z.string().nullable(),
}).merge(AuditFieldsSchema)
export type Client = z.infer<typeof ClientSchema>

export const ClientCreateInputSchema = ClientSchema.pick({
  organizationId: true,
  fullName: true,
  email: true,
  phone: true,
  preferredContact: true,
  notes: true,
})
export type ClientCreateInput = z.infer<typeof ClientCreateInputSchema>

export const ClientListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  search: z.string().optional(),
})
export type ClientListInput = z.infer<typeof ClientListInputSchema>

export const ClientListOutputSchema = ListOutputSchema(ClientSchema)
export type ClientListOutput = z.infer<typeof ClientListOutputSchema>

export interface IClientService {
  list(input: ClientListInput): Promise<ClientListOutput>
  get(id: string, organizationId: string): Promise<Client | null>
  create(input: ClientCreateInput): Promise<Client>
}

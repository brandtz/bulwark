/**
 * shared/contracts/property-attachment.ts — non-photo property documents
 * (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008, ADR-0018)
 *   - Distinct from `property_photos` so the UI can render documents
 *     differently (list with kind chip vs gallery grid) and so future
 *     OCR / mime-typed pipelines don't have to scan past JPEGs.
 *   - `kind` is a string (`survey|plat|insurance|permit|other` known) —
 *     admins can extend via the label registry; the service tolerates
 *     unknown kinds.
 *   - `url` accepts a stub `local://attachments/<uuid>` for the W2-1
 *     slice; the W3-1 storage cutover swaps in signed-URL S3/R2 the
 *     same way photos do.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const ATTACHMENT_KIND_LABEL: Record<string, string> = {
  survey: 'Survey',
  plat: 'Plat',
  insurance: 'Insurance',
  permit: 'Permit',
  other: 'Other',
}

export const PropertyAttachmentSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  kind: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  uploadedByUserId: UuidSchema.nullable(),
}).merge(AuditFieldsSchema)
export type PropertyAttachment = z.infer<typeof PropertyAttachmentSchema>

export const PropertyAttachmentCreateInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  kind: z.string().min(1).default('other'),
  name: z.string().min(1),
  url: z.string().min(1),
  uploadedByUserId: UuidSchema.nullable().optional(),
})
export type PropertyAttachmentCreateInput = z.infer<typeof PropertyAttachmentCreateInputSchema>

export interface IPropertyAttachmentService {
  list(organizationId: string): Promise<PropertyAttachment[]>
  listForProperty(propertyId: string, organizationId: string): Promise<PropertyAttachment[]>
  get(id: string, organizationId: string): Promise<PropertyAttachment | null>
  create(input: PropertyAttachmentCreateInput): Promise<PropertyAttachment>
  softDelete(id: string, organizationId: string): Promise<void>
}

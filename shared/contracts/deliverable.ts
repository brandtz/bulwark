/** A generated document artifact scoped to a property and its work orders. */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const DeliverableKindSchema = z.enum([
  'compliance_package',
  'completion_report',
  'warranty_certificate',
  'custom',
])
export type DeliverableKind = z.infer<typeof DeliverableKindSchema>

export const DeliverableStatusSchema = z.enum([
  'draft',
  'generating',
  'ready',
  'failed',
  'cancelled',
])
export type DeliverableStatus = z.infer<typeof DeliverableStatusSchema>

export function isTerminalDeliverableStatus(status: DeliverableStatus): boolean {
  return status === 'ready' || status === 'failed' || status === 'cancelled'
}

export const DeliverableSignatureSchema = z.object({
  signedByName: z.string().min(1).max(120),
  dataUrl: z.string().min(20).startsWith('data:image/'),
  signedAt: z.string().datetime(),
})
export type DeliverableSignature = z.infer<typeof DeliverableSignatureSchema>

export const DeliverableSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    kind: DeliverableKindSchema,
    propertyId: UuidSchema,
    workOrderIds: z.array(UuidSchema).min(1),
    includedSlotIds: z.array(UuidSchema).min(1),
    signature: DeliverableSignatureSchema,
    jobId: z.string().nullable(),
    status: DeliverableStatusSchema,
    resultUrl: z.string().url().nullable(),
    error: z.string().nullable(),
  })
  .merge(AuditFieldsSchema)
export type Deliverable = z.infer<typeof DeliverableSchema>

export const DeliverableCreateInputSchema = z.object({
  organizationId: UuidSchema,
  kind: DeliverableKindSchema.optional(),
  propertyId: UuidSchema,
  workOrderIds: z.array(UuidSchema).min(1),
  includedSlotIds: z.array(UuidSchema).min(1),
  signature: DeliverableSignatureSchema.omit({ signedAt: true }),
})
export type DeliverableCreateInput = z.infer<typeof DeliverableCreateInputSchema>

export const DeliverableListInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema.optional(),
})
export type DeliverableListInput = z.infer<typeof DeliverableListInputSchema>

export interface IDeliverableService {
  list(input: DeliverableListInput): Promise<Deliverable[]>
  get(id: string, organizationId: string): Promise<Deliverable | null>
  create(input: DeliverableCreateInput): Promise<Deliverable>
  syncFromJob(id: string, organizationId: string): Promise<Deliverable>
  reconcileGenerating(input: {
    organizationId: string
    olderThanMinutes?: number
  }): Promise<{ reconciled: number; docIds: string[] }>
  reenqueue(id: string, organizationId: string): Promise<Deliverable>
}
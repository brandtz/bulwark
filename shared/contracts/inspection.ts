/**
 * shared/contracts/inspection.ts — inspections + responses
 * (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Why this lives next to inspection-template.ts
 *
 * Templates describe what to capture; inspections record an actual
 * field visit. Two domains, one engine. Splitting the contracts keeps
 * the editor flows (template CRUD) from polluting the capture flows
 * (inspection run + sign + evaluate).
 *
 * # Backward compatibility with `assessments`
 *
 * Wave 4 will migrate the legacy `assessments` table into this model;
 * meanwhile the existing assessment screens keep working. Code paths
 * that need to ask "does this property have a signed inspection?"
 * should consult BOTH services until the migration lands.
 */
import { z } from 'zod'
import { AuditFieldsSchema, ListOutputSchema, PaginationInputSchema, UuidSchema } from './_shared'

export const InspectionStatusSchema = z.enum(['draft', 'submitted', 'signed', 'superseded'])
export type InspectionStatus = z.infer<typeof InspectionStatusSchema>

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  signed: 'Signed',
  superseded: 'Superseded',
}

// ----------------------------------------------------------------------------
// Inspection row.
// ----------------------------------------------------------------------------
export const InspectionSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  buildingId: UuidSchema.nullable(),
  templateId: UuidSchema,
  templateVersion: z.number().int().positive(),
  programId: UuidSchema.nullable(),
  inspectorUserId: UuidSchema.nullable(),
  startedAt: z.string().datetime(),
  submittedAt: z.string().datetime().nullable(),
  signedAt: z.string().datetime().nullable(),
  signedByName: z.string().nullable(),
  signatureUrl: z.string().nullable(),
  status: InspectionStatusSchema,
  summary: z.string().nullable(),
}).merge(AuditFieldsSchema)
export type Inspection = z.infer<typeof InspectionSchema>

// ----------------------------------------------------------------------------
// Inspection response row.
// ----------------------------------------------------------------------------
export const InspectionResponseSchema = z.object({
  id: UuidSchema,
  inspectionId: UuidSchema,
  sectionInstanceKey: z.string().min(1),
  fieldSlug: z.string().min(1),
  valueJson: z.unknown().nullable(),
  photosCount: z.number().int().nonnegative(),
  notes: z.string().nullable(),
}).merge(AuditFieldsSchema)
export type InspectionResponse = z.infer<typeof InspectionResponseSchema>

export const InspectionWithResponsesSchema = InspectionSchema.extend({
  responses: z.array(InspectionResponseSchema),
})
export type InspectionWithResponses = z.infer<typeof InspectionWithResponsesSchema>

// ----------------------------------------------------------------------------
// Issue shape returned by `evaluate()`. Mirrors evaluatorRule severities.
// ----------------------------------------------------------------------------
export const InspectionIssueSchema = z.object({
  sectionInstanceKey: z.string(),
  sectionSlug: z.string(),
  fieldSlug: z.string(),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
})
export type InspectionIssue = z.infer<typeof InspectionIssueSchema>

// ----------------------------------------------------------------------------
// Inputs
// ----------------------------------------------------------------------------
export const InspectionCreateInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  buildingId: UuidSchema.nullable().optional(),
  templateId: UuidSchema,
  programId: UuidSchema.nullable().optional(),
  inspectorUserId: UuidSchema.nullable().optional(),
})
export type InspectionCreateInput = z.infer<typeof InspectionCreateInputSchema>

export const InspectionListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  propertyId: UuidSchema.optional(),
  status: InspectionStatusSchema.optional(),
})
export type InspectionListInput = z.infer<typeof InspectionListInputSchema>
export const InspectionListOutputSchema = ListOutputSchema(InspectionSchema)
export type InspectionListOutput = z.infer<typeof InspectionListOutputSchema>

export const ResponseInputSchema = z.object({
  sectionInstanceKey: z.string().min(1),
  fieldSlug: z.string().min(1),
  valueJson: z.unknown().nullable(),
  photosCount: z.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
})
export type ResponseInput = z.infer<typeof ResponseInputSchema>

export const SaveResponsesInputSchema = z.object({
  organizationId: UuidSchema,
  inspectionId: UuidSchema,
  responses: z.array(ResponseInputSchema),
})
export type SaveResponsesInput = z.infer<typeof SaveResponsesInputSchema>

export const InspectionSignInputSchema = z.object({
  organizationId: UuidSchema,
  inspectionId: UuidSchema,
  signedByName: z.string().min(1),
  signatureDataUrl: z.string().min(1),
})
export type InspectionSignInput = z.infer<typeof InspectionSignInputSchema>

// ----------------------------------------------------------------------------
// Service interface
// ----------------------------------------------------------------------------
export interface IInspectionService {
  list(input: InspectionListInput): Promise<InspectionListOutput>
  get(id: string, organizationId: string): Promise<Inspection | null>
  getWithResponses(id: string, organizationId: string): Promise<InspectionWithResponses | null>
  create(input: InspectionCreateInput): Promise<Inspection>
  saveResponses(input: SaveResponsesInput): Promise<void>
  submit(input: { organizationId: string; inspectionId: string }): Promise<Inspection>
  sign(input: InspectionSignInput): Promise<Inspection>
  evaluate(input: { organizationId: string; inspectionId: string }): Promise<{
    issues: InspectionIssue[]
  }>
}

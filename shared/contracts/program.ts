/**
 * shared/contracts/program.ts — GC programs domain (Wave 1A / EH-A / ADR-0013).
 *
 * # Why this contract exists (ADR-0008, ADR-0013)
 *
 * Bulwark today is implicitly wildfire-only: `OREGON_DEFAULT_STANDARDS`,
 * "compliance doc", "defensible space" — all hardcoded into the platform.
 * Per the sponsor's GC-generalization mandate (PHASE1_HARDENING_PLAN §2
 * Pivot P1 / directive D-H4), Bulwark must be a **general contractor
 * field-service platform** that ships with a **Wildfire Retrofit
 * program** as its inaugural inspection program. Roofing, siding,
 * kitchens, solar, decks, additions, etc. must be expressible WITHOUT
 * code changes.
 *
 * A `Program` is the unit of GC work. It owns:
 *   - an inspection template (what to capture in the field) — W2-2
 *   - a standard set (rules used to evaluate compliance)      — W2-2
 *   - a compliance doc template (terminal artifact PDF)       — W2-2
 *   - default trade slots (WO scaffolding)                    — W1-3
 *   - pricing defaults (markup/tax/expiry hints)              — W1-3
 *
 * Phase 1 ships the program model, the seed Wildfire program, the admin
 * CRUD surface, and the property↔program membership join. The four
 * template FKs land in W2-2 (Inspection Template Engine) and remain
 * nullable until then.
 *
 * # Relationship to inspections / standards / compliance docs
 *
 * Today the assessment+evaluator+compliance-doc seam is wildfire-coded.
 * Once W2-2 lands, every program declares its own inspection template
 * and standard set; the evaluator becomes a generic function over
 * `(inspection, standardSet) → result`. Wildfire stays as a builtin
 * program whose seeded template + standards reproduce today's behaviour
 * exactly. New programs (Roof Replacement, Kitchen Remodel, etc.) are
 * pure admin configuration.
 *
 * # Why "programs" and not "verticals" / "products" / "services"
 *
 * - "Verticals" implies whole industries (HVAC, plumbing) and clashes
 *   with platform marketing language.
 * - "Products" carries SKU/catalog connotations — wrong scope.
 * - "Services" overlaps with our existing `BulwarkServices` factory and
 *   would be ambiguous in code.
 * - "Programs" matches how GCs already talk: "we run a wildfire-retrofit
 *   program out of our Portland office and a roofing program out of
 *   Bend." Customer-recognizable.
 */
import { z } from 'zod'
import { AuditFieldsSchema, ListOutputSchema, PaginationInputSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Enums + per-program config blobs
// ----------------------------------------------------------------------------

export const ProgramKindSchema = z.enum(['inspection_program', 'service_program'])
export type ProgramKind = z.infer<typeof ProgramKindSchema>

export const PROGRAM_KIND_LABEL: Record<ProgramKind, string> = {
  inspection_program: 'Inspection program',
  service_program: 'Service program',
}

export const ProgramTradeDefaultSchema = z.object({
  tradeSlug: z.string().min(1),
  quantity: z.number().int().positive(),
})
export type ProgramTradeDefault = z.infer<typeof ProgramTradeDefaultSchema>

export const ProgramPricingDefaultsSchema = z.object({
  markupBps: z.number().int().min(0).max(100_000).optional(),
  taxBps: z.number().int().min(0).max(100_000).optional(),
  quoteExpiryDays: z.number().int().positive().max(365).optional(),
})
export type ProgramPricingDefaults = z.infer<typeof ProgramPricingDefaultsSchema>

// ----------------------------------------------------------------------------
// Entity schemas
// ----------------------------------------------------------------------------

/** Entity types that can be a member of a program. Free-text in DB. */
export const ProgramEntityTypeSchema = z.enum(['property', 'quote', 'work_order'])
export type ProgramEntityType = z.infer<typeof ProgramEntityTypeSchema>

export const ProgramSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/u, 'slug must be kebab-case'),
  name: z.string().min(1).max(120),
  kind: ProgramKindSchema,
  description: z.string().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/u).nullable(),
  icon: z.string().nullable(),
  isBuiltin: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  inspectionTemplateId: UuidSchema.nullable(),
  standardSetId: UuidSchema.nullable(),
  complianceDocTemplateId: UuidSchema.nullable(),
  defaultTradeSlots: z.array(ProgramTradeDefaultSchema).nullable(),
  pricingDefaults: ProgramPricingDefaultsSchema.nullable(),
}).merge(AuditFieldsSchema)
export type Program = z.infer<typeof ProgramSchema>

export const ProgramMembershipSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  programId: UuidSchema,
  entityType: ProgramEntityTypeSchema,
  entityId: UuidSchema,
  assignedAt: z.string().datetime(),
  assignedByUserId: UuidSchema.nullable(),
  notes: z.string().nullable(),
}).merge(AuditFieldsSchema)
export type ProgramMembership = z.infer<typeof ProgramMembershipSchema>

// ----------------------------------------------------------------------------
// Inputs
// ----------------------------------------------------------------------------

export const ProgramCreateInputSchema = z.object({
  organizationId: UuidSchema,
  slug: ProgramSchema.shape.slug,
  name: ProgramSchema.shape.name,
  kind: ProgramKindSchema,
  description: z.string().nullable().optional(),
  color: ProgramSchema.shape.color.optional(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  defaultTradeSlots: z.array(ProgramTradeDefaultSchema).nullable().optional(),
  pricingDefaults: ProgramPricingDefaultsSchema.nullable().optional(),
})
export type ProgramCreateInput = z.infer<typeof ProgramCreateInputSchema>

export const ProgramUpdateInputSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  name: ProgramSchema.shape.name.optional(),
  description: z.string().nullable().optional(),
  color: ProgramSchema.shape.color.optional(),
  icon: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  defaultTradeSlots: z.array(ProgramTradeDefaultSchema).nullable().optional(),
  pricingDefaults: ProgramPricingDefaultsSchema.nullable().optional(),
})
export type ProgramUpdateInput = z.infer<typeof ProgramUpdateInputSchema>

export const ProgramListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  kind: ProgramKindSchema.optional(),
  includeInactive: z.boolean().optional(),
  search: z.string().optional(),
})
export type ProgramListInput = z.infer<typeof ProgramListInputSchema>

export const ProgramListOutputSchema = ListOutputSchema(ProgramSchema)
export type ProgramListOutput = z.infer<typeof ProgramListOutputSchema>

export const ProgramAssignInputSchema = z.object({
  organizationId: UuidSchema,
  programId: UuidSchema,
  entityType: ProgramEntityTypeSchema,
  entityId: UuidSchema,
  notes: z.string().nullable().optional(),
})
export type ProgramAssignInput = z.infer<typeof ProgramAssignInputSchema>

export const ProgramUnassignInputSchema = z.object({
  organizationId: UuidSchema,
  programId: UuidSchema,
  entityType: ProgramEntityTypeSchema,
  entityId: UuidSchema,
})
export type ProgramUnassignInput = z.infer<typeof ProgramUnassignInputSchema>

// ----------------------------------------------------------------------------
// Service interface
// ----------------------------------------------------------------------------

export interface IProgramService {
  list(input: ProgramListInput): Promise<ProgramListOutput>
  get(id: string, organizationId: string): Promise<Program | null>
  create(input: ProgramCreateInput): Promise<Program>
  update(input: ProgramUpdateInput): Promise<Program>
  /** Soft-delete a program. Builtin programs reject; deactivate them instead. */
  softDelete(id: string, organizationId: string): Promise<void>
  assignToEntity(input: ProgramAssignInput): Promise<ProgramMembership>
  unassignFromEntity(input: ProgramUnassignInput): Promise<void>
  listMembershipsFor(
    input: { organizationId: string; entityType: ProgramEntityType; entityId: string },
  ): Promise<ProgramMembership[]>
  listEntitiesForProgram(
    input: { organizationId: string; programId: string; entityType: ProgramEntityType },
  ): Promise<ProgramMembership[]>
}

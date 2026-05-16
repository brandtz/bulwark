/**
 * shared/contracts/status-pipeline.ts — tenant-configurable status pipelines
 * (Wave 1B / EH-H Part A / W1-3 / ADR-0023).
 *
 * # Why this contract exists (ADR-0008, ADR-0023)
 *
 * Today the canonical status enums (property/quote/work_order/invoice/
 * compliance/job) live in code as Zod `z.enum([...])`. They're correct
 * for the platform's wildfire-program lineage, but the sponsor mandate
 * (PHASE1_HARDENING_PLAN §0 directive D-H2) requires admins to rename,
 * recolor, reorder, AND restrict which transitions are legal — without
 * a code change.
 *
 * A `StatusPipeline` is **the per-tenant, per-entityType authority** on
 * which status slugs exist and which transitions are legal. The Zod
 * enums in `property.ts`/`quote.ts`/etc. remain as the universe of
 * **seed slugs** the bootstrap defaults pull from; the pipeline rows
 * are the authoritative runtime config. The status engine (W1-4)
 * consumes this contract via `canTransition()` BEFORE applying any
 * domain mutation.
 *
 * # Versioning model
 *
 * Editing a pipeline creates a NEW pipeline row (version + 1) with the
 * same `(organizationId, entityType)` tuple, sets `isActive=true`, and
 * deactivates the previous version. Historical versions are retained
 * read-only so audit + reporting can answer "what was the pipeline at
 * the time this work order moved to 'completed'?" without losing data
 * to overwrites.
 *
 * # Relationship to W1-2 labels
 *
 * Each node carries a `labelKey` (e.g. `status.property.lead`). UI
 * resolves the display string via `useLabel().t('status.<entity>',
 * slug, fallback)` — the labels editor changes COPY; the pipeline
 * editor changes STRUCTURE (slugs, order, allowed transitions, color).
 * The two surfaces are intentionally separate to keep edits scoped.
 *
 * # Decision cast down
 *
 *   - Rejected: pgEnum for `entityType`. Adding `dispatch`/`lead`/etc.
 *     would force migrations forever. Text + Zod boundary check.
 *   - Rejected: mutating nodes in place. Loses the historical pipeline
 *     anchor described above; trades a clean audit story for a smaller
 *     storage footprint we don't need.
 *   - Rejected: declaring `allowedTransitions` as a junction table.
 *     For pipelines of ≤20 nodes the JSONB string[] is cheaper to read
 *     and atomic to write inside a single node row update.
 *   - Rejected: hard-coding "every status can transition to every
 *     status." The whole point of D-H2 is admin-authored constraints
 *     — if there's no graph, there's no editor value.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Entity type whitelist — the domains pipelines apply to. Text in DB.
// ----------------------------------------------------------------------------
export const StatusPipelineEntityTypeSchema = z.enum([
  'property',
  'quote',
  'work_order',
  'invoice',
  'compliance',
  'job',
])
export type StatusPipelineEntityType = z.infer<typeof StatusPipelineEntityTypeSchema>

export const STATUS_PIPELINE_ENTITY_LABEL: Record<StatusPipelineEntityType, string> = {
  property: 'Property',
  quote: 'Quote',
  work_order: 'Work order',
  invoice: 'Invoice',
  compliance: 'Compliance',
  job: 'Job',
}

// ----------------------------------------------------------------------------
// Node — one status in a pipeline. Slug is the stable identifier; labelKey
// feeds the W1-2 useLabel() composable for display copy.
// ----------------------------------------------------------------------------
export const HexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u, 'Expected hex color like #1E3A8A')

export const StatusPipelineNodeSchema = z
  .object({
    id: UuidSchema,
    pipelineId: UuidSchema,
    slug: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/u, 'slug must be snake_case'),
    labelKey: z.string().min(1).max(120),
    color: HexColorSchema,
    description: z.string().max(500).nullable(),
    sortOrder: z.number().int(),
    isInitial: z.boolean(),
    isTerminal: z.boolean(),
    /** Slugs of nodes reachable from this one via a legal transition. */
    allowedTransitions: z.array(z.string().min(1).max(64)),
  })
  .merge(AuditFieldsSchema)
export type StatusPipelineNode = z.infer<typeof StatusPipelineNodeSchema>

// ----------------------------------------------------------------------------
// Pipeline header.
// ----------------------------------------------------------------------------
export const StatusPipelineSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    entityType: StatusPipelineEntityTypeSchema,
    version: z.number().int().positive(),
    isActive: z.boolean(),
  })
  .merge(AuditFieldsSchema)
export type StatusPipeline = z.infer<typeof StatusPipelineSchema>

/** Pipeline + nodes nested — the canonical read shape for the editor + engine. */
export const StatusPipelineFullSchema = StatusPipelineSchema.extend({
  nodes: z.array(StatusPipelineNodeSchema),
})
export type StatusPipelineFull = z.infer<typeof StatusPipelineFullSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------

/**
 * Save = bump version + activate. Input contains the full node list (the
 * editor is full-replace per ADR-0023 versioning model). Exactly one node
 * must be `isInitial`; at least one must be `isTerminal`.
 */
export const StatusPipelineNodeInputSchema = z.object({
  slug: StatusPipelineNodeSchema.shape.slug,
  labelKey: StatusPipelineNodeSchema.shape.labelKey,
  color: HexColorSchema,
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int(),
  isInitial: z.boolean(),
  isTerminal: z.boolean(),
  allowedTransitions: z.array(z.string().min(1).max(64)),
})
export type StatusPipelineNodeInput = z.infer<typeof StatusPipelineNodeInputSchema>

export const StatusPipelineSaveInputSchema = z.object({
  organizationId: UuidSchema,
  entityType: StatusPipelineEntityTypeSchema,
  nodes: z.array(StatusPipelineNodeInputSchema).min(2),
})
export type StatusPipelineSaveInput = z.infer<typeof StatusPipelineSaveInputSchema>

export const StatusPipelineActivateInputSchema = z.object({
  organizationId: UuidSchema,
  pipelineId: UuidSchema,
})
export type StatusPipelineActivateInput = z.infer<typeof StatusPipelineActivateInputSchema>

export const CanTransitionInputSchema = z.object({
  organizationId: UuidSchema,
  entityType: StatusPipelineEntityTypeSchema,
  fromSlug: z.string().min(1).max(64),
  toSlug: z.string().min(1).max(64),
})
export type CanTransitionInput = z.infer<typeof CanTransitionInputSchema>

export const CanTransitionOutputSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
})
export type CanTransitionOutput = z.infer<typeof CanTransitionOutputSchema>

// ----------------------------------------------------------------------------
// Outputs.
// ----------------------------------------------------------------------------
export const StatusPipelineFullOutputSchema = StatusPipelineFullSchema
export type StatusPipelineFullOutput = StatusPipelineFull

export const StatusPipelineListOutputSchema = z.object({
  rows: z.array(StatusPipelineFullSchema),
})
export type StatusPipelineListOutput = z.infer<typeof StatusPipelineListOutputSchema>

// ----------------------------------------------------------------------------
// Service interface — the contract W1-4 consumes via `canTransition`.
// ----------------------------------------------------------------------------
export interface IStatusPipelineService {
  /** Return the active pipeline for `(org, entityType)`, or null if absent. */
  getActive(input: {
    organizationId: string
    entityType: StatusPipelineEntityType
  }): Promise<StatusPipelineFull | null>
  /** Every pipeline (all versions) for the org, optionally filtered. */
  list(input: {
    organizationId: string
    entityType?: StatusPipelineEntityType
  }): Promise<StatusPipelineListOutput>
  /** Create a new version and activate it. Previous active version is deactivated. */
  save(input: StatusPipelineSaveInput): Promise<StatusPipelineFull>
  /**
   * Idempotent: if no pipeline exists for `(org, entityType)`, create v1 from
   * `DEFAULT_PIPELINES`. Otherwise return the active one.
   */
  bootstrap(input: {
    organizationId: string
    entityType: StatusPipelineEntityType
  }): Promise<StatusPipelineFull>
  /**
   * W2-3 / EH-G: extend an existing active pipeline with any default
   * nodes that are missing (e.g. when the platform ships a new
   * status like `invoice.partial`). Existing nodes — including
   * admin-renamed labels and edited transition graphs — are NEVER
   * overwritten. Returns the post-reconcile pipeline. Idempotent
   * (a second call is a no-op).
   */
  reconcileWithDefaults(input: {
    organizationId: string
    entityType: StatusPipelineEntityType
  }): Promise<StatusPipelineFull>
  /**
   * Pure(ish) policy check used by W1-4 (state continuity engine). Reads
   * the active pipeline and returns `{ allowed, reason? }`. An unknown
   * fromSlug or toSlug is `allowed: false` with an explanatory reason.
   */
  canTransition(input: CanTransitionInput): Promise<CanTransitionOutput>
}

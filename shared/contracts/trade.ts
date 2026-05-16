/**
 * shared/contracts/trade.ts — tenant-configurable trades catalog
 * (Wave 1B / EH-H Part A / W1-3).
 *
 * # Why this contract exists
 *
 * The platform ships with a frozen `TradeSchema` Zod enum (roofing,
 * siding, gutters, eaves_vents, defensible_space, general_labor) used
 * by Work Order trade slots and Subcontractor `trades[]` arrays. Per
 * directive D-H2 admins must be able to:
 *   - rename / recolor the built-in trades
 *   - reorder them in the chip picker
 *   - add CUSTOM trades (e.g. "framing", "solar-install") that the WO
 *     scaffolder offers as new slot kinds in Wave 2+
 *
 * Today the Zod `TradeSchema` enum still constrains WO + Sub JSONB
 * columns, so the slug universe is bounded to those 6 values until
 * those contracts are widened (Wave 2-3). The `trades` table seeds
 * those 6 slugs as built-ins per org AND accepts custom slugs that
 * Wave 2 WO scaffolding can consume once the WO contract relaxes.
 *
 * # Decisions captured (ADR-0008)
 *
 *   - Org-scoped slug uniqueness (matches the `programs` pattern).
 *   - `isBuiltin=true` rows reject `softDelete` (mirrors programs).
 *   - `name` is a fallback display string; `useLabel().t('trade',
 *     slug, name)` is the canonical render path.
 *
 * # Decision cast down
 *
 *   - Rejected: dropping the `TradeSchema` enum and unconstraining
 *     WO/Sub JSONB. That ripples through every quote/WO scaffold
 *     site + every fixture. Wave 2-3 work; flagged in the handoff.
 *   - Rejected: per-trade rate cards on the trade row. Catalog +
 *     pricing are separate concerns — Wave 2 W2-4 owns materials/
 *     labor rates. Trades here are taxonomy only.
 */
import { z } from 'zod'
import { AuditFieldsSchema, ListOutputSchema, PaginationInputSchema, UuidSchema } from './_shared'

export const TradeRecordSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    slug: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/u, 'slug must be snake_case'),
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable(),
    color: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u)
      .nullable(),
    icon: z.string().max(40).nullable(),
    sortOrder: z.number().int(),
    isBuiltin: z.boolean(),
    isActive: z.boolean(),
  })
  .merge(AuditFieldsSchema)
export type TradeRecord = z.infer<typeof TradeRecordSchema>

export const TradeCreateInputSchema = z.object({
  organizationId: UuidSchema,
  slug: TradeRecordSchema.shape.slug,
  name: TradeRecordSchema.shape.name,
  description: z.string().max(500).nullable().optional(),
  color: TradeRecordSchema.shape.color.optional(),
  icon: z.string().max(40).nullable().optional(),
  sortOrder: z.number().int().optional(),
})
export type TradeCreateInput = z.infer<typeof TradeCreateInputSchema>

export const TradeUpdateInputSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  name: TradeRecordSchema.shape.name.optional(),
  description: z.string().max(500).nullable().optional(),
  color: TradeRecordSchema.shape.color.optional(),
  icon: z.string().max(40).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})
export type TradeUpdateInput = z.infer<typeof TradeUpdateInputSchema>

export const TradeListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  includeInactive: z.boolean().optional(),
})
export type TradeListInput = z.infer<typeof TradeListInputSchema>

export const TradeListOutputSchema = ListOutputSchema(TradeRecordSchema)
export type TradeListOutput = z.infer<typeof TradeListOutputSchema>

export interface ITradeService {
  list(input: TradeListInput): Promise<TradeListOutput>
  get(id: string, organizationId: string): Promise<TradeRecord | null>
  create(input: TradeCreateInput): Promise<TradeRecord>
  update(input: TradeUpdateInput): Promise<TradeRecord>
  /** Built-in trades reject hard delete; deactivate via `update({ isActive: false })`. */
  softDelete(id: string, organizationId: string): Promise<void>
  /** Idempotent: insert the 6 builtin trades for an org if they don't exist. */
  bootstrap(input: { organizationId: string }): Promise<TradeListOutput>
}

/** Canonical built-in trade slugs. Matches the existing `TradeSchema` enum. */
export const BUILTIN_TRADES: ReadonlyArray<{
  slug: string
  name: string
  color: string
  sortOrder: number
}> = [
  { slug: 'roofing', name: 'Roofing', color: '#B45309', sortOrder: 10 },
  { slug: 'siding', name: 'Siding', color: '#0E7490', sortOrder: 20 },
  { slug: 'gutters', name: 'Gutters', color: '#475569', sortOrder: 30 },
  { slug: 'eaves_vents', name: 'Eaves & vents', color: '#7C3AED', sortOrder: 40 },
  { slug: 'defensible_space', name: 'Defensible space', color: '#15803D', sortOrder: 50 },
  { slug: 'general_labor', name: 'General labor', color: '#1F2937', sortOrder: 60 },
]

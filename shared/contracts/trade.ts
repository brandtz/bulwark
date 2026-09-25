/**
 * shared/contracts/trade.ts — tenant-configurable trades catalog
 * (Wave 1B / EH-H Part A / W1-3).
 *
 * # Why this contract exists
 *
 * Work Order trade slots and Subcontractor `trades[]` arrays carry
 * catalog-backed slugs. Services validate each slug against the active
 * organization's trade catalog. Per directive D-H2 admins must be able to:
 *   - rename / recolor the built-in trades
 *   - reorder them in the chip picker
 *   - add custom trades (e.g. "framing", "solar-install") for WO slots
 *
 * The `trades` table seeds six built-in slugs per org and also accepts
 * custom kebab-case or snake_case slugs for work orders and subcontractors.
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
    slug: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u, 'slug must be kebab-case or snake_case'),
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
  assertActiveSlugs(organizationId: string, slugs: readonly string[]): Promise<void>
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

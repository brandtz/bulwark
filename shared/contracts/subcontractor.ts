/**
 * shared/contracts/subcontractor.ts — Subcontractor domain (E6).
 *
 * # Decisions (ADR-0008)
 *   - A Subcontractor record is a small CRM-like row: company, contact,
 *     license info, list of trades they cover. Used by the work-order
 *     trade-assignment UI (E6-S3) and the subcontractor list (E6-S5).
 *   - `trades` is a `z.array(TradeSchema)` reusing the same enum the
 *     work-order contract reads from. One source of truth — both
 *     contracts import this enum.
 *   - License fields are optional but presence is required to mark
 *     a sub as "compliance-ready" in E7. We keep them lax here and
 *     enforce policy at higher levels.
 *
 * # Decision cast down
 *   - Rejected: per-trade rate cards on the sub. The trade-pricing
 *     catalog lives in E9 (Settings); subs don't carry their own rate
 *     overrides in v1.
 *   - Rejected: a `status` enum (active/inactive/blocked). Tenant-level
 *     soft-delete via `deletedAt` is enough for v1; hard suspension can
 *     be a column once we have a real reason to filter on it.
 */
import { z } from 'zod'
import {
  AuditFieldsSchema,
  ListOutputSchema,
  PaginationInputSchema,
  UuidSchema,
} from './_shared'

// ----------------------------------------------------------------------------
// Trade enum — shared with work-order. Each trade is one row inside a WO.
// ----------------------------------------------------------------------------
export const TradeSchema = z.enum([
  'roofing',
  'siding',
  'gutters',
  'eaves_vents',
  'defensible_space',
  'general_labor',
])
export type Trade = z.infer<typeof TradeSchema>

export const TRADE_LABEL: Record<Trade, string> = {
  roofing: 'Roofing',
  siding: 'Siding',
  gutters: 'Gutters',
  eaves_vents: 'Eaves & vents',
  defensible_space: 'Defensible space',
  general_labor: 'General labor',
}

// ----------------------------------------------------------------------------
// Subcontractor record.
// ----------------------------------------------------------------------------
export const SubcontractorSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    companyName: z.string().min(1).max(120),
    contactName: z.string().min(1).max(120),
    email: z.string().email().nullable(),
    phone: z.string().min(1).max(40),
    trades: z.array(TradeSchema).min(1),
    licenseNumber: z.string().max(60).nullable(),
    licenseExpiresAt: z.string().datetime().nullable(),
    notes: z.string().nullable(),
  })
  .merge(AuditFieldsSchema)
export type Subcontractor = z.infer<typeof SubcontractorSchema>

// ----------------------------------------------------------------------------
// List input/output.
// ----------------------------------------------------------------------------
export const SubcontractorListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  trade: TradeSchema.optional(),
})
export type SubcontractorListInput = z.infer<typeof SubcontractorListInputSchema>

export const SubcontractorListOutputSchema = ListOutputSchema(SubcontractorSchema)
export type SubcontractorListOutput = z.infer<typeof SubcontractorListOutputSchema>

// ----------------------------------------------------------------------------
// Create input — same shape as Update but with required identity fields so
// the server has everything it needs to insert a row. Wired up in E14-S6.
// ----------------------------------------------------------------------------
export const SubcontractorCreateInputSchema = SubcontractorSchema.pick({
  organizationId: true,
  companyName: true,
  contactName: true,
  email: true,
  phone: true,
  trades: true,
  licenseNumber: true,
  licenseExpiresAt: true,
  notes: true,
})
export type SubcontractorCreateInput = z.infer<typeof SubcontractorCreateInputSchema>

// ----------------------------------------------------------------------------
// Update input — license info + contact details. Server determines which
// fields it accepts; v1 contract is permissive within the SubcontractorSchema
// shape. Trades stay editable so an admin can correct an onboarding mistake.
// ----------------------------------------------------------------------------
export const SubcontractorUpdateInputSchema = SubcontractorSchema.pick({
  companyName: true,
  contactName: true,
  email: true,
  phone: true,
  trades: true,
  licenseNumber: true,
  licenseExpiresAt: true,
  notes: true,
}).partial()
export type SubcontractorUpdateInput = z.infer<typeof SubcontractorUpdateInputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface ISubcontractorService {
  list(input: SubcontractorListInput): Promise<SubcontractorListOutput>
  get(id: string, organizationId: string): Promise<Subcontractor | null>
  create(input: SubcontractorCreateInput): Promise<Subcontractor>
  update(
    id: string,
    input: SubcontractorUpdateInput,
    organizationId: string,
  ): Promise<Subcontractor>
}

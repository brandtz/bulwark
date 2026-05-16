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
// W3-4 / EH-N — sub portal: membership + COI + assignment views.
// ----------------------------------------------------------------------------
export const SubcontractorUserSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    subcontractorId: UuidSchema,
    userId: UuidSchema,
    email: z.string().email(),
    fullName: z.string(),
    invitedAt: z.string().datetime(),
    acceptedAt: z.string().datetime().nullable(),
  })
  .merge(AuditFieldsSchema)
export type SubcontractorUser = z.infer<typeof SubcontractorUserSchema>

export const SubInviteInputSchema = z.object({
  organizationId: UuidSchema,
  subcontractorId: UuidSchema,
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  invitedByUserId: UuidSchema.nullable().optional(),
})
export type SubInviteInput = z.infer<typeof SubInviteInputSchema>

export const SubInviteOutputSchema = z.object({
  inviteId: UuidSchema,
  membershipId: UuidSchema,
  inviteUrl: z.string(),
  inviteToken: z.string(),
})
export type SubInviteOutput = z.infer<typeof SubInviteOutputSchema>

export const SubcontractorCoiDocSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    subcontractorId: UuidSchema,
    fileUrl: z.string(),
    fileName: z.string(),
    expiresAt: z.string().datetime(),
    uploadedByUserId: UuidSchema.nullable(),
    uploadedAt: z.string().datetime(),
    notes: z.string().nullable(),
  })
  .merge(AuditFieldsSchema)
export type SubcontractorCoiDoc = z.infer<typeof SubcontractorCoiDocSchema>

export const SubCoiUploadInputSchema = z.object({
  organizationId: UuidSchema,
  subcontractorId: UuidSchema,
  fileUrl: z.string().min(1),
  fileName: z.string().min(1).max(200),
  expiresAt: z.string().datetime(),
  notes: z.string().max(500).nullable().optional(),
})
export type SubCoiUploadInput = z.infer<typeof SubCoiUploadInputSchema>

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
  /**
   * W3-4 / EH-N — sub portal: list users attached to a sub. Used by
   * the sub-settings page so an admin can see "who can sign in for
   * this subcontractor".
   */
  listUsers(subcontractorId: string, organizationId: string): Promise<SubcontractorUser[]>
  /** Invite a user to a sub. Creates `pending_invites` + `subcontractor_users`. */
  inviteUser(input: SubInviteInput): Promise<SubInviteOutput>
  /** Remove a sub-user membership (soft delete). */
  removeUser(membershipId: string, organizationId: string): Promise<void>
  /** Resolve which sub a given user belongs to (used by the sub-role middleware). */
  resolveSubForUser(
    userId: string,
    organizationId: string,
  ): Promise<{ subcontractorId: string } | null>
  /** List WOs that have any slot assigned to the user's sub. */
  listMyAssignments(userId: string, organizationId: string): Promise<unknown[]>
  /** List quotes flagged as awaiting sub response for the user's sub. */
  listMyQuotesRequested(userId: string, organizationId: string): Promise<unknown[]>
  // ---- COI tracking ------------------------------------------------------
  /** List COI documents for a sub (newest first). */
  listCois(subcontractorId: string, organizationId: string): Promise<SubcontractorCoiDoc[]>
  /** Upload a new COI for a sub. Emits `subCoiUploaded`. */
  uploadCoi(input: SubCoiUploadInput): Promise<SubcontractorCoiDoc>
  /**
   * Scan COIs across the org for those expiring within `withinDays`
   * (default 30). Emits `subCoiExpiringSoon` for each.
   */
  scanCoiExpiry(input: {
    organizationId: string
    withinDays?: number
    nowIso?: string
  }): Promise<SubcontractorCoiDoc[]>
}

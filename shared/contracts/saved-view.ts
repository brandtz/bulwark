/**
 * shared/contracts/saved-view.ts — saved list views (W3-5 / EH-P / ADR-0033).
 *
 * # Decisions (ADR-0008, ADR-0033)
 *   - List pages (properties / quotes / WOs / invoices / …) own the
 *     shape of `filters`. The contract treats it as `Record<string,
 *     unknown>` so adding a new filter key doesn't ripple through a
 *     migration or a contract revision.
 *   - **Visibility**: `list({ orgId, userId, entityType })` returns
 *     the union of (a) the user's own views + (b) shared org views
 *     (`userId IS NULL`). Org-admins can also delete shared views;
 *     users can only manage rows they own.
 *   - **Defaults**: at most one default per (org, user, entityType).
 *     `setDefault()` clears siblings transactionally.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Allowed entity types for saved views. Kept open-ended; new list
// pages append here as they ship.
// ----------------------------------------------------------------------------
export const SavedViewEntityTypeSchema = z.enum([
  'property',
  'quote',
  'work-order',
  'invoice',
  'subcontractor',
  'inspection',
  'client',
])
export type SavedViewEntityType = z.infer<typeof SavedViewEntityTypeSchema>

// ----------------------------------------------------------------------------
// Row.
// ----------------------------------------------------------------------------
export const SavedViewSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    /** `null` = shared org-wide view. */
    userId: UuidSchema.nullable(),
    entityType: SavedViewEntityTypeSchema,
    name: z.string().min(1).max(120),
    filters: z.record(z.unknown()),
    sortBy: z.string().nullable(),
    sortDir: z.enum(['asc', 'desc']).nullable(),
    isDefault: z.boolean(),
  })
  .merge(AuditFieldsSchema)
export type SavedView = z.infer<typeof SavedViewSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const SavedViewListInputSchema = z.object({
  organizationId: UuidSchema,
  userId: UuidSchema,
  entityType: SavedViewEntityTypeSchema,
})
export type SavedViewListInput = z.infer<typeof SavedViewListInputSchema>

export const SavedViewCreateInputSchema = z.object({
  organizationId: UuidSchema,
  userId: UuidSchema.nullable(),
  entityType: SavedViewEntityTypeSchema,
  name: z.string().min(1).max(120),
  filters: z.record(z.unknown()).default({}),
  sortBy: z.string().min(1).max(60).nullable().optional(),
  sortDir: z.enum(['asc', 'desc']).nullable().optional(),
  isDefault: z.boolean().optional(),
})
export type SavedViewCreateInput = z.infer<typeof SavedViewCreateInputSchema>

export const SavedViewUpdateInputSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  name: z.string().min(1).max(120).optional(),
  filters: z.record(z.unknown()).optional(),
  sortBy: z.string().min(1).max(60).nullable().optional(),
  sortDir: z.enum(['asc', 'desc']).nullable().optional(),
  isDefault: z.boolean().optional(),
})
export type SavedViewUpdateInput = z.infer<typeof SavedViewUpdateInputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface ISavedViewService {
  list(input: SavedViewListInput): Promise<SavedView[]>
  get(id: string, organizationId: string): Promise<SavedView | null>
  create(input: SavedViewCreateInput): Promise<SavedView>
  update(input: SavedViewUpdateInput): Promise<SavedView>
  softDelete(id: string, organizationId: string): Promise<void>
  /**
   * Promote a view to default for its (org, user, entityType). Clears
   * the flag on siblings in the same transaction.
   */
  setDefault(id: string, organizationId: string): Promise<SavedView>
}

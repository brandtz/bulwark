/**
 * shared/contracts/_shared.ts — Zod helpers shared across all domain contracts.
 *
 * Per CONTRACTS.md these are the canonical conventions for entity shape, list
 * pagination wrappers, and money. Any new contract starts here.
 */
import { z } from 'zod'

// ----------------------------------------------------------------------------
// Roles — must match server/db/schema/users.ts roleEnum exactly. ADR-0002 +
// ADR-0008: keeping these in lockstep is a maintenance contract; any drift
// is a critical bug.
// ----------------------------------------------------------------------------
export const RoleSchema = z.enum([
  'super_admin',
  'org_admin',
  'org_manager',
  'field',
  'sub_contractor',
  'viewer',
])
export type Role = z.infer<typeof RoleSchema>

// ----------------------------------------------------------------------------
// Audit fields. At the API boundary timestamps are ISO strings, NOT Date
// objects (Date doesn't survive JSON.stringify round-trips cleanly on
// every client).
// ----------------------------------------------------------------------------
export const AuditFieldsSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
})

// ----------------------------------------------------------------------------
// Pagination wrappers. Every list/<scope> endpoint uses these.
// ----------------------------------------------------------------------------
export const PaginationInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(200).default(25),
})
export type PaginationInput = z.infer<typeof PaginationInputSchema>

export const ListOutputSchema = <T extends z.ZodTypeAny>(rowSchema: T) =>
  z.object({
    rows: z.array(rowSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  })

// ----------------------------------------------------------------------------
// Money. Always integer cents. Helper for display lives in shared/utils/money.
// ----------------------------------------------------------------------------
export const MoneyCentsSchema = z.number().int().nonnegative()

// ----------------------------------------------------------------------------
// Common ID + scoping shapes
// ----------------------------------------------------------------------------
export const UuidSchema = z.string().uuid()

export const TenantScopeSchema = z.object({
  organizationId: UuidSchema,
})
export type TenantScope = z.infer<typeof TenantScopeSchema>

/**
 * shared/contracts/permission.ts — granular permission overrides
 * (W2-5 / EH-I / ADR-0025).
 *
 * # What this file does
 *   - Wire shape for a per-tenant permission override row + the
 *     `IPermissionService` interface that admin UI calls when a user
 *     toggles a permission cell.
 *   - Re-exports `PERMISSION_SLUGS` from `shared/auth/default-permissions`
 *     via runtime imports in the service layer; this file stays
 *     side-effect free.
 *
 * # Decisions (ADR-0025-permission-overrides, ADR-0008)
 *   - **Defaults live in code, overrides live in the DB.** The
 *     `permissions` table stores only diffs from the static catalog;
 *     a missing row means "use the default for this (role, slug)".
 *   - **Overrides are role-scoped, not user-scoped.** Per-user
 *     overrides are a Phase 2 cleanup once we have customer demand.
 *   - **`getEffectivePermissions` returns a Record<slug, boolean>.**
 *     The caller doesn't care WHERE the answer came from (default vs
 *     override) — they just need the boolean. Audit rows record the
 *     overrides as they are written, so traceability lives there.
 *   - **`bulkUpsert` is single-shot, NOT incremental.** The Permission
 *     matrix UI saves cell-by-cell, but admin "reset to defaults"
 *     issues a `resetToDefaults(orgId)` that deletes all override
 *     rows for that org. Predictable rollback.
 *
 * # Decisions NOT taken
 *   - Encoding the slug as a Zod enum tied to the catalog. Rejected —
 *     the catalog ships in code; adding a slug is a code change, not
 *     a contract change, and we don't want every contract bump to
 *     ripple to the wire shape.
 */
import { z } from 'zod'
import { AuditFieldsSchema, RoleSchema, UuidSchema } from './_shared'

export const PermissionSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema.nullable(),
    role: RoleSchema,
    permissionSlug: z.string().min(1),
    allowed: z.boolean(),
  })
  .merge(AuditFieldsSchema)
export type Permission = z.infer<typeof PermissionSchema>

export const PermissionUpsertInputSchema = z.object({
  organizationId: UuidSchema,
  role: RoleSchema,
  permissionSlug: z.string().min(1),
  allowed: z.boolean(),
})
export type PermissionUpsertInput = z.infer<typeof PermissionUpsertInputSchema>

export const PermissionBulkUpsertInputSchema = z.object({
  organizationId: UuidSchema,
  entries: z.array(PermissionUpsertInputSchema.omit({ organizationId: true })),
})
export type PermissionBulkUpsertInput = z.infer<typeof PermissionBulkUpsertInputSchema>

export interface IPermissionService {
  listForOrg(organizationId: string): Promise<{ permissions: Permission[] }>
  upsert(input: PermissionUpsertInput): Promise<Permission>
  bulkUpsert(input: PermissionBulkUpsertInput): Promise<{ permissions: Permission[] }>
  resetToDefaults(organizationId: string): Promise<{ deleted: number }>
  getEffectivePermissions(
    role: z.infer<typeof RoleSchema>,
    organizationId: string,
  ): Promise<Record<string, boolean>>
}

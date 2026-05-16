/**
 * server/services/permission.real.ts — RealPermissionService
 * (W2-5 / EH-I / ADR-0025).
 *
 * # What this file does
 *   - Persists per-(org, role, slug) override rows.
 *     `getEffectivePermissions` merges static defaults +
 *     per-org override rows for a role into a `Record<slug, boolean>`.
 *
 * # Decisions (ADR-0025-permission-overrides, ADR-0008)
 *   - **Defaults stay in code.** Override rows are diffs; missing
 *     row → static default applies.
 *   - **Upsert via select-then-update/insert.** Drizzle's
 *     `onConflictDoUpdate` requires a target index expression; the
 *     triple-unique index is fine but the select path is clearer to
 *     read at this volume. v2 can switch.
 *   - **`resetToDefaults` HARD-deletes rows.** This is the explicit
 *     "back to factory" lever; audit is captured by the wrapping
 *     service-route hook (W3-1) when wired.
 */
import { and, eq } from 'drizzle-orm'
import type {
  IPermissionService,
  Permission,
  PermissionBulkUpsertInput,
  PermissionUpsertInput,
} from '../../shared/contracts/permission'
import type { Role } from '../../shared/contracts/_shared'
import { permissions } from '../db/schema/permissions'
import { getDb } from '../db/client'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { getDefaultPermissionsForRole } from '../../shared/auth/default-permissions'

type Row = typeof permissions.$inferSelect

function rowToContract(r: Row): Permission {
  return {
    id: r.id,
    organizationId: r.organizationId,
    role: r.role,
    permissionSlug: r.permissionSlug,
    allowed: r.allowed,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealPermissionService implements IPermissionService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async listForOrg(organizationId: string): Promise<{ permissions: Permission[] }> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(permissions)
      .where(eq(permissions.organizationId, organizationId))
    return { permissions: rows.map(rowToContract) }
  }

  async upsert(input: PermissionUpsertInput): Promise<Permission> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const [existing] = await db
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.organizationId, input.organizationId),
          eq(permissions.role, input.role),
          eq(permissions.permissionSlug, input.permissionSlug),
        ),
      )
      .limit(1)
    if (existing) {
      const [updated] = await db
        .update(permissions)
        .set({ allowed: input.allowed, updatedAt: new Date() })
        .where(eq(permissions.id, existing.id))
        .returning()
      return rowToContract(updated!)
    }
    const [inserted] = await db
      .insert(permissions)
      .values({
        organizationId: input.organizationId,
        role: input.role,
        permissionSlug: input.permissionSlug,
        allowed: input.allowed,
      })
      .returning()
    return rowToContract(inserted!)
  }

  async bulkUpsert(input: PermissionBulkUpsertInput): Promise<{ permissions: Permission[] }> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const out: Permission[] = []
    for (const e of input.entries) {
      out.push(
        await this.upsert({
          organizationId: input.organizationId,
          role: e.role,
          permissionSlug: e.permissionSlug,
          allowed: e.allowed,
        }),
      )
    }
    return { permissions: out }
  }

  async resetToDefaults(organizationId: string): Promise<{ deleted: number }> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const result = await db
      .delete(permissions)
      .where(eq(permissions.organizationId, organizationId))
      .returning({ id: permissions.id })
    return { deleted: result.length }
  }

  async getEffectivePermissions(role: Role, organizationId: string): Promise<Record<string, boolean>> {
    const db = getDb()
    const merged = getDefaultPermissionsForRole(role)
    const rows = await db
      .select()
      .from(permissions)
      .where(and(eq(permissions.organizationId, organizationId), eq(permissions.role, role)))
    for (const r of rows) merged[r.permissionSlug] = r.allowed
    return merged
  }
}

/**
 * shared/mocks/permission.mock.ts — MockPermissionService
 * (W2-5 / EH-I / ADR-0025).
 *
 * # What this file does
 *   - In-memory `IPermissionService` for offline/demo + unit tests.
 *     Stores a list of override rows per org; merges with the static
 *     catalog on `getEffectivePermissions`.
 *
 * # Decisions (ADR-0008, ADR-0025)
 *   - **Stable IDs across runs** via `nanoid`-style randomBytes hex so
 *     contract validation passes (UUID-looking but content irrelevant
 *     to tests).
 *   - **Tenant firewall enforced** on every mutating method.
 *   - **`resetToDefaults` clears all override rows for the org.**
 *     Predictable rollback; mirrors the real impl semantics.
 */
import { randomBytes } from 'node:crypto'
import type {
  IPermissionService,
  Permission,
  PermissionBulkUpsertInput,
  PermissionUpsertInput,
} from '../contracts/permission'
import { assertSameTenant, type TenantResolver } from './tenant'
import { getDefaultPermissionsForRole } from '../auth/default-permissions'
import type { Role } from '../contracts/_shared'

const overrides: Permission[] = []

function uuid(): string {
  const b = randomBytes(16)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const hex = b.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

export class MockPermissionService implements IPermissionService {
  constructor(private readonly resolver?: TenantResolver) {}

  async listForOrg(organizationId: string): Promise<{ permissions: Permission[] }> {
    assertSameTenant(this.resolver, organizationId)
    return { permissions: overrides.filter((p) => p.organizationId === organizationId) }
  }

  async upsert(input: PermissionUpsertInput): Promise<Permission> {
    assertSameTenant(this.resolver, input.organizationId)
    const existing = overrides.find(
      (p) =>
        p.organizationId === input.organizationId &&
        p.role === input.role &&
        p.permissionSlug === input.permissionSlug,
    )
    const now = nowIso()
    if (existing) {
      existing.allowed = input.allowed
      existing.updatedAt = now
      return existing
    }
    const row: Permission = {
      id: uuid(),
      organizationId: input.organizationId,
      role: input.role,
      permissionSlug: input.permissionSlug,
      allowed: input.allowed,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    overrides.push(row)
    return row
  }

  async bulkUpsert(input: PermissionBulkUpsertInput): Promise<{ permissions: Permission[] }> {
    assertSameTenant(this.resolver, input.organizationId)
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
    assertSameTenant(this.resolver, organizationId)
    let deleted = 0
    for (let i = overrides.length - 1; i >= 0; i--) {
      if (overrides[i]!.organizationId === organizationId) {
        overrides.splice(i, 1)
        deleted++
      }
    }
    return { deleted }
  }

  async getEffectivePermissions(role: Role, organizationId: string): Promise<Record<string, boolean>> {
    // No tenant assert: any signed-in user should be able to see their own effective perms.
    const merged = getDefaultPermissionsForRole(role)
    for (const o of overrides) {
      if (o.organizationId === organizationId && o.role === role) {
        merged[o.permissionSlug] = o.allowed
      }
    }
    return merged
  }
}

/** Test-only reset. */
export function __resetMockPermissionsForTests(): void {
  overrides.length = 0
}

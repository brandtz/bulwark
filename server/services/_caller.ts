/**
 * server/services/_caller.ts — caller identity checks for self-scoped methods
 * (WP-L07 S7).
 *
 * The RPC role policy decides which roles may call a method at all. Methods
 * that take a user or subcontractor id "on behalf of" the caller must also
 * prove the caller is that user / a member of that subcontractor, unless the
 * caller administers the organization. Trusted server code (no resolver or no
 * session) is not restricted, mirroring assertSameTenant.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { memberships } from '../db/schema/users'
import { subcontractorUsers } from '../db/schema/subcontractor_users'
import { workOrders } from '../db/schema/work_orders'
import { ForbiddenError, SYSTEM_USER_ID, type TenantResolver } from './_tenant'

const ADMIN_ROLES = new Set(['super_admin', 'org_admin', 'org_manager'])

async function callerIsOrgAdmin(userId: string, organizationId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1)
  return !!row && ADMIN_ROLES.has(row.role)
}

function sessionCaller(resolver: TenantResolver | undefined): string | null {
  const userId = resolver?.()?.userId
  return userId && userId !== SYSTEM_USER_ID ? userId : null
}

/** The caller must be `userId` or an org admin. */
export async function assertActsAsSelf(resolver: TenantResolver | undefined, userId: string, organizationId: string): Promise<void> {
  const caller = sessionCaller(resolver)
  if (!caller || caller === userId) return
  if (await callerIsOrgAdmin(caller, organizationId)) return
  throw new ForbiddenError('Forbidden: you can only act as yourself')
}

/** The caller must belong to `subcontractorId` or be an org admin. */
export async function assertOwnSubcontractor(resolver: TenantResolver | undefined, subcontractorId: string, organizationId: string): Promise<void> {
  const caller = sessionCaller(resolver)
  if (!caller) return
  const [link] = await getDb()
    .select({ id: subcontractorUsers.subcontractorId })
    .from(subcontractorUsers)
    .where(and(
      eq(subcontractorUsers.userId, caller),
      eq(subcontractorUsers.subcontractorId, subcontractorId),
      eq(subcontractorUsers.organizationId, organizationId),
      isNull(subcontractorUsers.deletedAt),
    ))
    .limit(1)
  if (link) return
  if (await callerIsOrgAdmin(caller, organizationId)) return
  throw new ForbiddenError('Forbidden: not a member of this subcontractor')
}

/**
 * Properties on which the subcontractor holds a work-order trade slot. Until
 * quotes carry an explicit sub-request link (ED-054), this is the boundary for
 * what a subcontractor may see or answer.
 */
export async function subcontractorPropertyIds(subcontractorId: string, organizationId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ propertyId: workOrders.propertyId })
    .from(workOrders)
    .where(and(
      eq(workOrders.organizationId, organizationId),
      isNull(workOrders.deletedAt),
      sql`${workOrders.tradeSlots}::text LIKE ${'%' + subcontractorId + '%'}`,
    ))
  return rows.map((r) => r.propertyId)
}

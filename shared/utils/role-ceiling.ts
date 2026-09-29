/**
 * shared/utils/role-ceiling.ts — who may grant which membership role.
 *
 * The RPC policy lets every admin-group role call user.invite / user.setRole,
 * so without a ceiling an org_manager could grant super_admin (the org owner
 * role) to themselves. A caller may grant only roles at or below their own
 * rank and may not change a member who outranks them. Shared by the real and
 * mock user services.
 */
import type { Role } from '../contracts/_shared'
import { ForbiddenError } from '../mocks/tenant'

export const ROLE_RANK: Readonly<Record<Role, number>> = {
  super_admin: 4, org_admin: 3, org_manager: 2,
  field: 1, viewer: 1, sub_contractor: 1, homeowner: 1, stakeholder: 1,
}

export function assertMayAssignRole(actorRole: Role | null | undefined, grant: Role, currentRole?: Role | null): void {
  if (!actorRole) throw new ForbiddenError('Forbidden: not a member of this organization')
  const rank = ROLE_RANK[actorRole]
  if (ROLE_RANK[grant] > rank) throw new ForbiddenError(`Forbidden: ${actorRole} cannot grant ${grant}`)
  if (currentRole && ROLE_RANK[currentRole] > rank) throw new ForbiddenError(`Forbidden: ${actorRole} cannot change a ${currentRole}`)
}

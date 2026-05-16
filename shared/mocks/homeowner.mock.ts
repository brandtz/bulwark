/**
 * shared/mocks/homeowner.mock.ts — MockHomeownerService (W3-4 / EH-O).
 *
 * # Decisions (ADR-0008, ADR-0032)
 *   - In-memory list of `HomeownerUser` rows keyed by (orgId, propertyId,
 *     userId). The Subcontractor mock pattern is reused: deterministic
 *     ids via `nid()`, tenant firewall on every method.
 *   - `invite()` creates the membership row in a pre-accepted state
 *     (no user actually exists in the mock auth fixtures); the mock
 *     returns an invite URL that callers can use to build assertions.
 *     Real backend creates a `users` row + `pending_invites` row.
 */
import type {
  IHomeownerService,
  HomeownerUser,
  HomeownerInviteInput,
  HomeownerInviteOutput,
} from '../contracts/homeowner'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: HomeownerUser[] = []
let memId = 1
function nid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(memId++).toString(36)}`
}

/** Test-only reset hook. */
export function __resetHomeownerMock(): void {
  rows.length = 0
  memId = 1
}

export class MockHomeownerService implements IHomeownerService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async listForProperty(propertyId: string, organizationId: string): Promise<HomeownerUser[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows.filter(
      (r) =>
        r.propertyId === propertyId &&
        r.organizationId === organizationId &&
        !r.deletedAt,
    )
  }

  async listForUser(userId: string, organizationId: string): Promise<HomeownerUser[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows.filter(
      (r) => r.userId === userId && r.organizationId === organizationId && !r.deletedAt,
    )
  }

  async invite(input: HomeownerInviteInput): Promise<HomeownerInviteOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = new Date().toISOString()
    const id = nid('howner')
    const userId = nid('user')
    const row: HomeownerUser = {
      id,
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      userId,
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      kind: input.kind,
      invitedAt: now,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    const token = `mock-${id}`
    return {
      inviteId: id,
      membershipId: id,
      inviteUrl: `/accept-invite?token=${token}`,
      inviteToken: token,
    }
  }

  async remove(membershipId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const idx = rows.findIndex(
      (r) => r.id === membershipId && r.organizationId === organizationId,
    )
    if (idx === -1) return
    rows[idx] = { ...rows[idx]!, deletedAt: new Date().toISOString() }
  }
}

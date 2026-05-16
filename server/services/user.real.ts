/**
 * server/services/user.real.ts — RealUserService (W2-4 / EH-H Part B / ADR-0021).
 *
 * # Decisions (ADR-0021)
 *   - Status DERIVED: see status mapping in the user contract.
 *     `invited` rows come from `pending_invites` (not yet accepted).
 *     `active` / `suspended` / `deactivated` derive from
 *     `(users.isActive, memberships.isActive)`.
 *   - `invite()` writes a `pending_invites` row with sha256(token) hex
 *     AND emits a `user.invited` event. The signed-URL invite token
 *     that the recipient clicks lives in the email — for Phase 1 the
 *     admin copies it from the success toast (W3-1 wires Resend).
 *   - We deliberately keep `acceptInvite` in `IAuthService` (already
 *     implemented in auth.real.ts). The user-service invite path only
 *     CREATES the pending invite + token. The auth service consumes
 *     either the legacy JWT token (existing flow) or the new
 *     sha256-hashed token (this row) — see ADR-0021 for the dual-token
 *     transition.
 *   - `transferOwnership` enforces super_admin via the resolver's
 *     active session — the role-check happens at the service layer
 *     (defense in depth on top of the role middleware on the page).
 */
import { randomBytes, createHash } from 'node:crypto'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type {
  IUserService,
  InviteInput,
  InviteOutput,
  SetRoleInput,
  TransferOwnershipInput,
  UserAdminRow,
  UserListInput,
  UserListOutput,
} from '../../shared/contracts/user'
import type { Role } from '../../shared/contracts/_shared'
import { users, memberships } from '../db/schema/users'
import { pendingInvites } from '../db/schema/pending_invites'
import { getDb } from '../db/client'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { emit } from '../../shared/events/bus'
import { userInvited, type UserInvitedPayload } from '../../shared/events/catalog'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function deriveStatus(userActive: boolean, membershipActive: boolean): UserAdminRow['status'] {
  if (!userActive) return 'deactivated'
  if (!membershipActive) return 'suspended'
  return 'active'
}

export class RealUserService implements IUserService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: UserListInput): Promise<UserListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()

    const memberRows = await db
      .select({
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        userActive: users.isActive,
        membershipActive: memberships.isActive,
        role: memberships.role,
        createdAt: memberships.createdAt,
        updatedAt: memberships.updatedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, input.organizationId))

    const inviteRows = await db
      .select()
      .from(pendingInvites)
      .where(
        and(
          eq(pendingInvites.organizationId, input.organizationId),
          isNull(pendingInvites.acceptedAt),
          isNull(pendingInvites.revokedAt),
        ),
      )
      .orderBy(desc(pendingInvites.createdAt))

    const out: UserAdminRow[] = []
    for (const m of memberRows) {
      const status = deriveStatus(m.userActive, m.membershipActive)
      if (input.role && m.role !== input.role) continue
      if (input.status && status !== input.status) continue
      out.push({
        kind: 'member',
        id: m.userId,
        membershipUserId: m.userId,
        organizationId: input.organizationId,
        email: m.email,
        fullName: m.fullName,
        role: m.role as Role,
        status,
        avatarUrl: m.avatarUrl,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        deletedAt: null,
      })
    }
    if (!input.status || input.status === 'invited') {
      for (const inv of inviteRows) {
        if (input.role && inv.role !== input.role) continue
        out.push({
          kind: 'invite',
          id: inv.id,
          organizationId: inv.organizationId,
          email: inv.email,
          role: inv.role as Role,
          status: 'invited',
          invitedByUserId: inv.invitedByUserId,
          expiresAt: inv.expiresAt.toISOString(),
          createdAt: inv.createdAt.toISOString(),
          updatedAt: inv.updatedAt.toISOString(),
          deletedAt: null,
        })
      }
    }
    return { users: out }
  }

  async invite(input: InviteInput): Promise<InviteOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const email = input.email.toLowerCase()
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = sha256Hex(rawToken)
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

    const result = await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(pendingInvites)
        .values({
          organizationId: input.organizationId,
          email,
          role: input.role,
          invitedByUserId: input.invitedByUserId,
          tokenHash,
          expiresAt,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'pending_invite',
        entityId: row!.id,
        action: 'create',
        actorUserId: input.invitedByUserId,
        after: { email, role: input.role },
      })
      return row!
    })

    const payload: UserInvitedPayload = {
      organizationId: input.organizationId,
      entityId: result.id,
      actorUserId: input.invitedByUserId,
      timestamp: new Date().toISOString(),
      email,
      role: input.role,
      inviteId: result.id,
    }
    await emit(userInvited, payload)

    return {
      inviteId: result.id,
      inviteUrl: `/accept-invite?token=${rawToken}`,
      inviteToken: rawToken,
    }
  }

  async revokeInvite(inviteId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(pendingInvites)
        .where(
          and(
            eq(pendingInvites.id, inviteId),
            eq(pendingInvites.organizationId, organizationId),
          ),
        )
        .limit(1)
      if (!before) throw new Error('Invite not found')
      if (before.acceptedAt) throw new Error('Cannot revoke an accepted invite')
      await tx
        .update(pendingInvites)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(pendingInvites.id, inviteId))
      await audit.record({
        organizationId,
        entityType: 'pending_invite',
        entityId: inviteId,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'revoke' },
      })
    })
  }

  async resendInvite(inviteId: string, organizationId: string): Promise<InviteOutput> {
    assertSameTenant(this.tenantResolver, organizationId)
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = sha256Hex(rawToken)
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    const result = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(pendingInvites)
        .where(
          and(
            eq(pendingInvites.id, inviteId),
            eq(pendingInvites.organizationId, organizationId),
          ),
        )
        .limit(1)
      if (!before) throw new Error('Invite not found')
      if (before.acceptedAt || before.revokedAt) throw new Error('Invite is no longer open')
      const [row] = await tx
        .update(pendingInvites)
        .set({ tokenHash, expiresAt, updatedAt: new Date() })
        .where(eq(pendingInvites.id, inviteId))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'pending_invite',
        entityId: inviteId,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'resend' },
      })
      return row!
    })
    return {
      inviteId: result.id,
      inviteUrl: `/accept-invite?token=${rawToken}`,
      inviteToken: rawToken,
    }
  }

  async setRole(input: SetRoleInput): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, input.userId),
            eq(memberships.organizationId, input.organizationId),
          ),
        )
        .limit(1)
      if (!before) throw new Error('Membership not found')
      await tx
        .update(memberships)
        .set({ role: input.role, updatedAt: new Date() })
        .where(
          and(
            eq(memberships.userId, input.userId),
            eq(memberships.organizationId, input.organizationId),
          ),
        )
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'membership',
        entityId: input.userId,
        action: 'update',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        before: { role: before.role },
        after: { role: input.role },
      })
    })
  }

  async suspend(userId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await this.toggleMembership(userId, organizationId, false, 'suspend')
  }
  async reactivate(userId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await this.toggleMembership(userId, organizationId, true, 'reactivate')
    // Also flip user-level isActive back on so a previously-deactivated
    // user becomes fully usable.
    await getDb()
      .update(users)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
  }
  async deactivate(userId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      await tx
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, userId))
      await audit.record({
        organizationId,
        entityType: 'user',
        entityId: userId,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'deactivate' },
      })
    })
  }

  private async toggleMembership(
    userId: string,
    organizationId: string,
    active: boolean,
    kind: 'suspend' | 'reactivate',
  ): Promise<void> {
    await withAudit(async ({ tx, audit }) => {
      await tx
        .update(memberships)
        .set({ isActive: active, updatedAt: new Date() })
        .where(
          and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)),
        )
      await audit.record({
        organizationId,
        entityType: 'membership',
        entityId: userId,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind },
      })
    })
  }

  async transferOwnership(input: TransferOwnershipInput): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    // Defense-in-depth: enforce super_admin at the service layer.
    const actor = this.tenantResolver?.()
    if (!actor?.userId) throw new Error('Authentication required')
    const db = getDb()
    const [actorMembership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, actor.userId),
          eq(memberships.organizationId, input.organizationId),
        ),
      )
      .limit(1)
    if (actorMembership?.role !== 'super_admin') {
      throw new Error('Only super_admin may transfer ownership')
    }
    await withAudit(async ({ tx, audit }) => {
      await tx
        .update(memberships)
        .set({ role: 'org_admin', updatedAt: new Date() })
        .where(
          and(
            eq(memberships.userId, input.newOwnerUserId),
            eq(memberships.organizationId, input.organizationId),
          ),
        )
      await tx
        .update(memberships)
        .set({ role: 'org_manager', updatedAt: new Date() })
        .where(
          and(
            eq(memberships.userId, actor.userId!),
            eq(memberships.organizationId, input.organizationId),
          ),
        )
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'membership',
        entityId: input.newOwnerUserId,
        action: 'state_change',
        actorUserId: actor.userId,
        metadata: { kind: 'transfer_ownership' },
      })
    })
  }
}

void sql // silence unused-warning if the import is later trimmed

/**
 * server/services/homeowner.real.ts — RealHomeownerService (W3-4 / EH-O / ADR-0032).
 *
 * # Decisions (ADR-0008, ADR-0032)
 *   - The homeowner is a regular `users` row + a `homeowner_users`
 *     membership row keyed by property. We DO NOT add membership rows
 *     to `memberships` for the GC's org tenancy — the homeowner is
 *     NOT a tenant member; they're a portal user attached to the GC's
 *     property. The role is enforced by the `homeowner_role`
 *     middleware reading the `homeowner_users` join, not by a row in
 *     the `memberships` table.
 *   - Actually — for v1, we DO add a `memberships` row with role=
 *     `homeowner` because the existing auth flow keys session state
 *     to `memberships` (active org, role). The middleware can then
 *     read role=`homeowner` AND the join row to scope which
 *     properties they see.
 *   - Audit-log every membership change.
 *   - Tenant firewall via `assertSameTenant`.
 */
import { randomBytes, createHash } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type {
  IHomeownerService,
  HomeownerUser,
  HomeownerInviteInput,
  HomeownerInviteOutput,
} from '../../shared/contracts/homeowner'
import { getDb } from '../db/client'
import { homeownerUsers } from '../db/schema/homeowner_users'
import { users, memberships } from '../db/schema/users'
import { pendingInvites } from '../db/schema/pending_invites'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { emit } from '../../shared/events/bus'
import { homeownerInvited } from '../../shared/events/catalog'

function rowToContract(
  r: typeof homeownerUsers.$inferSelect & { email: string; fullName: string },
): HomeownerUser {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    userId: r.userId,
    email: r.email,
    fullName: r.fullName,
    kind: (r.kind as HomeownerUser['kind']),
    invitedAt: r.invitedAt.toISOString(),
    acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealHomeownerService implements IHomeownerService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async listForProperty(propertyId: string, organizationId: string): Promise<HomeownerUser[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select({
        id: homeownerUsers.id,
        organizationId: homeownerUsers.organizationId,
        propertyId: homeownerUsers.propertyId,
        userId: homeownerUsers.userId,
        kind: homeownerUsers.kind,
        invitedAt: homeownerUsers.invitedAt,
        acceptedAt: homeownerUsers.acceptedAt,
        createdAt: homeownerUsers.createdAt,
        updatedAt: homeownerUsers.updatedAt,
        deletedAt: homeownerUsers.deletedAt,
        email: users.email,
        fullName: users.fullName,
      })
      .from(homeownerUsers)
      .innerJoin(users, eq(users.id, homeownerUsers.userId))
      .where(
        and(
          eq(homeownerUsers.propertyId, propertyId),
          eq(homeownerUsers.organizationId, organizationId),
          isNull(homeownerUsers.deletedAt),
        ),
      )
      .orderBy(desc(homeownerUsers.invitedAt))
    return rows.map(rowToContract)
  }

  async listForUser(userId: string, organizationId: string): Promise<HomeownerUser[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select({
        id: homeownerUsers.id,
        organizationId: homeownerUsers.organizationId,
        propertyId: homeownerUsers.propertyId,
        userId: homeownerUsers.userId,
        kind: homeownerUsers.kind,
        invitedAt: homeownerUsers.invitedAt,
        acceptedAt: homeownerUsers.acceptedAt,
        createdAt: homeownerUsers.createdAt,
        updatedAt: homeownerUsers.updatedAt,
        deletedAt: homeownerUsers.deletedAt,
        email: users.email,
        fullName: users.fullName,
      })
      .from(homeownerUsers)
      .innerJoin(users, eq(users.id, homeownerUsers.userId))
      .where(
        and(
          eq(homeownerUsers.userId, userId),
          eq(homeownerUsers.organizationId, organizationId),
          isNull(homeownerUsers.deletedAt),
        ),
      )
    return rows.map(rowToContract)
  }

  async invite(input: HomeownerInviteInput): Promise<HomeownerInviteOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const email = input.email.toLowerCase()
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const result = await withAudit(async ({ tx, audit }) => {
      // 1. Find-or-create the user row.
      const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1)
      let userId = existing?.id
      if (!userId) {
        const [created] = await tx
          .insert(users)
          .values({ email, fullName: input.fullName })
          .returning()
        userId = created!.id
      }

      // 2. Add homeowner membership (idempotent).
      const [existingMembership] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.organizationId, input.organizationId),
          ),
        )
        .limit(1)
      if (!existingMembership) {
        await tx.insert(memberships).values({
          userId,
          organizationId: input.organizationId,
          role: 'homeowner',
        })
      }

      // 3. Property membership row.
      const [memberRow] = await tx
        .insert(homeownerUsers)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          userId,
          kind: input.kind,
        })
        .returning()

      // 4. Pending invite token.
      const [inviteRow] = await tx
        .insert(pendingInvites)
        .values({
          organizationId: input.organizationId,
          email,
          role: 'homeowner',
          invitedByUserId: input.invitedByUserId ?? null,
          tokenHash,
          expiresAt,
        })
        .returning()

      await audit.record({
        organizationId: input.organizationId,
        entityType: 'homeowner_user',
        entityId: memberRow!.id,
        action: 'create',
        actorUserId: input.invitedByUserId ?? null,
        after: { propertyId: input.propertyId, email, kind: input.kind },
      })
      return { membershipId: memberRow!.id, inviteId: inviteRow!.id }
    })

    await emit(homeownerInvited, {
      organizationId: input.organizationId,
      entityId: result.membershipId,
      actorUserId: input.invitedByUserId ?? null,
      timestamp: new Date().toISOString(),
      email,
      propertyId: input.propertyId,
      kind: input.kind,
    })

    return {
      inviteId: result.inviteId,
      membershipId: result.membershipId,
      inviteUrl: `/accept-invite?token=${rawToken}`,
      inviteToken: rawToken,
    }
  }

  async remove(membershipId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(homeownerUsers)
        .where(
          and(
            eq(homeownerUsers.id, membershipId),
            eq(homeownerUsers.organizationId, organizationId),
          ),
        )
        .limit(1)
      if (!before) throw new Error('Membership not found')
      await tx
        .update(homeownerUsers)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(homeownerUsers.id, membershipId))
      await audit.record({
        organizationId,
        entityType: 'homeowner_user',
        entityId: membershipId,
        action: 'delete',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
      })
    })
  }
}

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
import { assertSameTenant, resolveActorUserId, SYSTEM_USER_ID, type TenantResolver } from './_tenant'
import type { Property } from '../../shared/contracts/property'
import type { Quote } from '../../shared/contracts/quote'
import type { Invoice } from '../../shared/contracts/invoice'
import { RealPropertyService } from './property.real'
import { RealQuoteService } from './quote.real'
import { RealInvoiceService } from './invoice.real'
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
          invitedByUserId: resolveActorUserId(this.tenantResolver) ?? input.invitedByUserId ?? null,
          tokenHash,
          expiresAt,
        })
        .returning()

      await audit.record({
        organizationId: input.organizationId,
        entityType: 'homeowner_user',
        entityId: memberRow!.id,
        action: 'create',
        actorUserId: resolveActorUserId(this.tenantResolver) ?? input.invitedByUserId ?? null,
        after: { propertyId: input.propertyId, email, kind: input.kind },
      })
      return { membershipId: memberRow!.id, inviteId: inviteRow!.id }
    })

    await emit(homeownerInvited, {
      organizationId: input.organizationId,
      entityId: result.membershipId,
      actorUserId: resolveActorUserId(this.tenantResolver) ?? input.invitedByUserId ?? null,
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

  // --- Self-scoped portal reads (WP-L07 S7) ----------------------------------
  // Identity comes from the session resolver only. Records on properties the
  // caller is not attached to, and drafts, are indistinguishable from missing.

  private callerUserId(): string {
    const userId = this.tenantResolver?.()?.userId
    if (!userId || userId === SYSTEM_USER_ID) throw new Error('Authentication required')
    return userId
  }

  private async myPropertyIds(organizationId: string): Promise<string[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const userId = this.callerUserId()
    const rows = await getDb()
      .select({ propertyId: homeownerUsers.propertyId })
      .from(homeownerUsers)
      .where(and(
        eq(homeownerUsers.userId, userId),
        eq(homeownerUsers.organizationId, organizationId),
        isNull(homeownerUsers.deletedAt),
      ))
    return [...new Set(rows.map((r) => r.propertyId))]
  }

  async listMyProperties(organizationId: string): Promise<Property[]> {
    const ids = await this.myPropertyIds(organizationId)
    const service = new RealPropertyService(this.tenantResolver)
    const rows = await Promise.all(ids.map((id) => service.get(id, organizationId)))
    return rows.filter((p): p is Property => p !== null)
  }

  async listMyQuotes(organizationId: string): Promise<Quote[]> {
    const ids = await this.myPropertyIds(organizationId)
    const service = new RealQuoteService(this.tenantResolver)
    const pages = await Promise.all(ids.map((propertyId) => service.list({ organizationId, propertyId, page: 1, pageSize: 200 })))
    return pages.flatMap((p) => p.rows).filter((q) => q.status !== 'draft')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getMyQuote(quoteId: string, organizationId: string): Promise<Quote | null> {
    const ids = await this.myPropertyIds(organizationId)
    const quote = await new RealQuoteService(this.tenantResolver).get(quoteId, organizationId).catch(() => null)
    return quote && quote.status !== 'draft' && ids.includes(quote.propertyId) ? quote : null
  }

  async listMyInvoices(organizationId: string): Promise<Invoice[]> {
    const ids = await this.myPropertyIds(organizationId)
    const service = new RealInvoiceService(this.tenantResolver)
    const pages = await Promise.all(ids.map((propertyId) => service.list({ organizationId, propertyId, page: 1, pageSize: 200 })))
    return pages.flatMap((p) => p.rows).filter((i) => i.status !== 'draft')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getMyInvoice(invoiceId: string, organizationId: string): Promise<Invoice | null> {
    const ids = await this.myPropertyIds(organizationId)
    const invoice = await new RealInvoiceService(this.tenantResolver).get(invoiceId, organizationId).catch(() => null)
    return invoice && invoice.status !== 'draft' && ids.includes(invoice.propertyId) ? invoice : null
  }
}

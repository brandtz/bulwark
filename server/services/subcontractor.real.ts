/**
 * server/services/subcontractor.real.ts — RealSubcontractorService (E11-S8).
 *
 * # Decisions (ADR-0008)
 *   - Same firewall + audit. Contract has no `create()` (subs are seeded
 *     elsewhere in v1); only list/get/update.
 *   - `trades` is a JSONB array; the optional `trade` filter in list()
 *     uses `?` (jsonb contains) via raw SQL since drizzle-orm's helper
 *     for JSONB membership isn't ergonomic for a single value.
 */
import { and, desc, eq, sql, isNull, type SQL } from 'drizzle-orm'
import { randomBytes, createHash } from 'node:crypto'
import type {
  ISubcontractorService,
  Subcontractor,
  SubcontractorCreateInput,
  SubcontractorListInput,
  SubcontractorListOutput,
  SubcontractorUpdateInput,
  SubcontractorUser,
  SubInviteInput,
  SubInviteOutput,
  SubcontractorCoiDoc,
  SubCoiUploadInput,
} from '../../shared/contracts/subcontractor'
import { getDb } from '../db/client'
import { subcontractors } from '../db/schema/subcontractors'
import type { Subcontractor as DbSub } from '../db/schema/subcontractors'
import { subcontractorUsers } from '../db/schema/subcontractor_users'
import { subcontractorCoiDocs } from '../db/schema/subcontractor_coi_docs'
import { users, memberships } from '../db/schema/users'
import { pendingInvites } from '../db/schema/pending_invites'
import { workOrders } from '../db/schema/work_orders'
import { quotes } from '../db/schema/quotes'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { emit } from '../../shared/events/bus'
import { subCoiUploaded, subCoiExpiringSoon } from '../../shared/events/catalog'

function rowToContract(r: DbSub): Subcontractor {
  return {
    id: r.id,
    organizationId: r.organizationId,
    companyName: r.companyName,
    contactName: r.contactName,
    email: r.email,
    phone: r.phone,
    trades: r.trades,
    licenseNumber: r.licenseNumber,
    licenseExpiresAt: r.licenseExpiresAt ? r.licenseExpiresAt.toISOString() : null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealSubcontractorService implements ISubcontractorService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: SubcontractorListInput): Promise<SubcontractorListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions: SQL[] = [
      eq(subcontractors.organizationId, input.organizationId),
      sql`${subcontractors.deletedAt} IS NULL`,
    ]
    if (input.trade) {
      // jsonb @> '["trade_value"]' works on a JSONB string-array.
      conditions.push(sql`${subcontractors.trades} @> ${JSON.stringify([input.trade])}::jsonb`)
    }
    const where = and(...conditions)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db.select().from(subcontractors).where(where).orderBy(desc(subcontractors.createdAt)).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(subcontractors).where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Subcontractor | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(subcontractors)
      .where(
        and(
          eq(subcontractors.id, id),
          eq(subcontractors.organizationId, organizationId),
          sql`${subcontractors.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: SubcontractorCreateInput): Promise<Subcontractor> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(subcontractors)
        .values({
          organizationId: input.organizationId,
          companyName: input.companyName,
          contactName: input.contactName,
          email: input.email ?? null,
          phone: input.phone,
          trades: input.trades,
          licenseNumber: input.licenseNumber ?? null,
          licenseExpiresAt: input.licenseExpiresAt ? new Date(input.licenseExpiresAt) : null,
          notes: input.notes ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'subcontractor',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        after: { companyName: row!.companyName, trades: row!.trades },
      })
      return rowToContract(row!)
    })
  }

  async update(id: string, input: SubcontractorUpdateInput, organizationId: string): Promise<Subcontractor> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(subcontractors)
        .where(and(eq(subcontractors.id, id), eq(subcontractors.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Subcontractor not found')

      const patch: Partial<typeof subcontractors.$inferInsert> = { updatedAt: new Date() }
      if (input.companyName !== undefined) patch.companyName = input.companyName
      if (input.contactName !== undefined) patch.contactName = input.contactName
      if (input.email !== undefined) patch.email = input.email
      if (input.phone !== undefined) patch.phone = input.phone
      if (input.trades !== undefined) patch.trades = input.trades
      if (input.licenseNumber !== undefined) patch.licenseNumber = input.licenseNumber
      if (input.licenseExpiresAt !== undefined) {
        patch.licenseExpiresAt = input.licenseExpiresAt ? new Date(input.licenseExpiresAt) : null
      }
      if (input.notes !== undefined) patch.notes = input.notes

      const [after] = await tx
        .update(subcontractors)
        .set(patch)
        .where(and(eq(subcontractors.id, id), eq(subcontractors.organizationId, organizationId)))
        .returning()

      await audit.record({
        organizationId,
        entityType: 'subcontractor',
        entityId: id,
        action: 'update',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        before: { companyName: before.companyName, trades: before.trades },
        after: { companyName: after!.companyName, trades: after!.trades },
      })
      return rowToContract(after!)
    })
  }

  // --------------------------------------------------------------------
  // W3-4 / EH-N — sub portal: membership, COI, assignment views.
  // --------------------------------------------------------------------

  async listUsers(
    subcontractorId: string,
    organizationId: string,
  ): Promise<SubcontractorUser[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select({
        id: subcontractorUsers.id,
        organizationId: subcontractorUsers.organizationId,
        subcontractorId: subcontractorUsers.subcontractorId,
        userId: subcontractorUsers.userId,
        invitedAt: subcontractorUsers.invitedAt,
        acceptedAt: subcontractorUsers.acceptedAt,
        createdAt: subcontractorUsers.createdAt,
        updatedAt: subcontractorUsers.updatedAt,
        deletedAt: subcontractorUsers.deletedAt,
        email: users.email,
        fullName: users.fullName,
      })
      .from(subcontractorUsers)
      .innerJoin(users, eq(users.id, subcontractorUsers.userId))
      .where(
        and(
          eq(subcontractorUsers.subcontractorId, subcontractorId),
          eq(subcontractorUsers.organizationId, organizationId),
          isNull(subcontractorUsers.deletedAt),
        ),
      )
      .orderBy(desc(subcontractorUsers.invitedAt))
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      subcontractorId: r.subcontractorId,
      userId: r.userId,
      email: r.email,
      fullName: r.fullName,
      invitedAt: r.invitedAt.toISOString(),
      acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    }))
  }

  async inviteUser(input: SubInviteInput): Promise<SubInviteOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const email = input.email.toLowerCase()
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const result = await withAudit(async ({ tx, audit }) => {
      // 1. Find-or-create a `users` row for this email (no password yet).
      const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1)
      let userId = existing?.id
      if (!userId) {
        const [created] = await tx
          .insert(users)
          .values({ email, fullName: input.fullName })
          .returning()
        userId = created!.id
      }

      // 2. Add a `sub_contractor` membership row in the GC's org (idempotent).
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
          role: 'sub_contractor',
        })
      }

      // 3. Create the subcontractor_users join row.
      const [membershipRow] = await tx
        .insert(subcontractorUsers)
        .values({
          organizationId: input.organizationId,
          subcontractorId: input.subcontractorId,
          userId,
        })
        .returning()

      // 4. Create the pending_invites token row.
      const [inviteRow] = await tx
        .insert(pendingInvites)
        .values({
          organizationId: input.organizationId,
          email,
          role: 'sub_contractor',
          invitedByUserId: input.invitedByUserId ?? null,
          tokenHash,
          expiresAt,
        })
        .returning()

      await audit.record({
        organizationId: input.organizationId,
        entityType: 'subcontractor_user',
        entityId: membershipRow!.id,
        action: 'create',
        actorUserId: input.invitedByUserId ?? null,
        after: { subcontractorId: input.subcontractorId, email },
      })

      return { membershipId: membershipRow!.id, inviteId: inviteRow!.id }
    })

    return {
      inviteId: result.inviteId,
      membershipId: result.membershipId,
      inviteUrl: `/accept-invite?token=${rawToken}`,
      inviteToken: rawToken,
    }
  }

  async removeUser(membershipId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(subcontractorUsers)
        .where(
          and(
            eq(subcontractorUsers.id, membershipId),
            eq(subcontractorUsers.organizationId, organizationId),
          ),
        )
        .limit(1)
      if (!before) throw new Error('Membership not found')
      await tx
        .update(subcontractorUsers)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(subcontractorUsers.id, membershipId))
      await audit.record({
        organizationId,
        entityType: 'subcontractor_user',
        entityId: membershipId,
        action: 'delete',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
      })
    })
  }

  async resolveSubForUser(
    userId: string,
    organizationId: string,
  ): Promise<{ subcontractorId: string } | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select({ subcontractorId: subcontractorUsers.subcontractorId })
      .from(subcontractorUsers)
      .where(
        and(
          eq(subcontractorUsers.userId, userId),
          eq(subcontractorUsers.organizationId, organizationId),
          isNull(subcontractorUsers.deletedAt),
        ),
      )
      .limit(1)
    return row ? { subcontractorId: row.subcontractorId } : null
  }

  async listMyAssignments(userId: string, organizationId: string): Promise<unknown[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const link = await this.resolveSubForUser(userId, organizationId)
    if (!link) return []
    const db = getDb()
    const rows = await db
      .select()
      .from(workOrders)
      .where(
        and(
          eq(workOrders.organizationId, organizationId),
          isNull(workOrders.deletedAt),
          sql`${workOrders.tradeSlots}::text LIKE ${'%' + link.subcontractorId + '%'}`,
        ),
      )
      .orderBy(desc(workOrders.createdAt))
    return rows
  }

  async listMyQuotesRequested(userId: string, organizationId: string): Promise<unknown[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const link = await this.resolveSubForUser(userId, organizationId)
    if (!link) return []
    const db = getDb()
    // Quotes table doesn't carry sub references in v1; we surface every
    // sent quote for the org so the sub can preview pricing. Real
    // implementation would filter on a sub-request flag.
    const rows = await db
      .select()
      .from(quotes)
      .where(
        and(
          eq(quotes.organizationId, organizationId),
          eq(quotes.status, 'sent'),
          isNull(quotes.deletedAt),
        ),
      )
      .orderBy(desc(quotes.createdAt))
      .limit(50)
    return rows
  }

  async listCois(
    subcontractorId: string,
    organizationId: string,
  ): Promise<SubcontractorCoiDoc[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(subcontractorCoiDocs)
      .where(
        and(
          eq(subcontractorCoiDocs.subcontractorId, subcontractorId),
          eq(subcontractorCoiDocs.organizationId, organizationId),
          isNull(subcontractorCoiDocs.deletedAt),
        ),
      )
      .orderBy(desc(subcontractorCoiDocs.uploadedAt))
    return rows.map(coiRowToContract)
  }

  async uploadCoi(input: SubCoiUploadInput): Promise<SubcontractorCoiDoc> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const row = await withAudit(async ({ tx, audit }) => {
      const [r] = await tx
        .insert(subcontractorCoiDocs)
        .values({
          organizationId: input.organizationId,
          subcontractorId: input.subcontractorId,
          fileUrl: input.fileUrl,
          fileName: input.fileName,
          expiresAt: new Date(input.expiresAt),
          uploadedByUserId: this.tenantResolver?.()?.userId ?? null,
          notes: input.notes ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'subcontractor_coi_doc',
        entityId: r!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        after: {
          subcontractorId: input.subcontractorId,
          fileName: input.fileName,
          expiresAt: input.expiresAt,
        },
      })
      return r!
    })
    await emit(subCoiUploaded, {
      organizationId: input.organizationId,
      entityId: row.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      docId: row.id,
      subcontractorId: input.subcontractorId,
      expiresAt: input.expiresAt,
    })
    return coiRowToContract(row)
  }

  async scanCoiExpiry(input: {
    organizationId: string
    withinDays?: number
    nowIso?: string
  }): Promise<SubcontractorCoiDoc[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const within = input.withinDays ?? 30
    const now = input.nowIso ? new Date(input.nowIso) : new Date()
    const cutoff = new Date(now.getTime() + within * 24 * 60 * 60 * 1000)
    const db = getDb()
    const rows = await db
      .select()
      .from(subcontractorCoiDocs)
      .where(
        and(
          eq(subcontractorCoiDocs.organizationId, input.organizationId),
          isNull(subcontractorCoiDocs.deletedAt),
          sql`${subcontractorCoiDocs.expiresAt} <= ${cutoff.toISOString()}`,
        ),
      )
    for (const r of rows) {
      const days = Math.max(
        0,
        Math.ceil((r.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      )
      await emit(subCoiExpiringSoon, {
        organizationId: input.organizationId,
        entityId: r.id,
        actorUserId: null,
        timestamp: now.toISOString(),
        docId: r.id,
        subcontractorId: r.subcontractorId,
        expiresAt: r.expiresAt.toISOString(),
        daysUntilExpiry: days,
      })
    }
    return rows.map(coiRowToContract)
  }
}

function coiRowToContract(
  r: typeof subcontractorCoiDocs.$inferSelect,
): SubcontractorCoiDoc {
  return {
    id: r.id,
    organizationId: r.organizationId,
    subcontractorId: r.subcontractorId,
    fileUrl: r.fileUrl,
    fileName: r.fileName,
    expiresAt: r.expiresAt.toISOString(),
    uploadedByUserId: r.uploadedByUserId,
    uploadedAt: r.uploadedAt.toISOString(),
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

/**
 * server/services/account.real.ts — RealAccountService
 * (W5-4 / Privacy + Compliance / ADR-0038).
 *
 * # What this file does
 *   - Implements `IAccountService` against Drizzle. Builds the per-user
 *     data export by joining across `users`, `memberships`,
 *     `homeowner_users` + `properties`, `subcontractor_users` +
 *     `subcontractors`, `notifications`, `notification_subscriptions`,
 *     and the user's own `audit_log` rows.
 *   - Soft-deletes the user row and audit-logs the request.
 *   - Provides the `purgeExpiredDeletions()` entry point that the
 *     daily cron stub in `server/jobs/account-purge.ts` calls.
 *
 * # Decisions (ADR-0008, ADR-0038)
 *   - **Tenant assertion intentionally skipped on export.** This is a
 *     per-USER request, not a per-org request — the user spans every
 *     org they belong to. The endpoint upstream authenticates the
 *     session and matches `userId` to the active session; that's the
 *     gate. Each downstream query is keyed by `userId` so cross-tenant
 *     leakage is structurally impossible.
 *   - **Foreign actors redacted.** Every `audit_log` row included in
 *     the export has `actorUserId === userId`. Rows authored by
 *     another user that mention `userId` (e.g., "admin X changed
 *     role for user Y") are excluded — they belong to the org's audit
 *     trail, not the user's.
 *   - **PII null-out on soft-delete.** `users.full_name` and
 *     `users.avatar_url` clear; `users.email` is replaced with a
 *     deterministic hash-based placeholder so the unique constraint
 *     holds and we can still detect "this hash tried to sign back
 *     up after deletion" (fraud-prevention legitimate interest).
 *     `users.is_active` flips false. `users.deleted_at` set to now.
 *   - **Sole-admin block lives here.** We query `memberships` for the
 *     user's `org_admin` rows, then for each one count other active
 *     admins of the same org. If any org has no surviving admin, we
 *     throw `SoleAdminError` with the list.
 *
 * # Decisions NOT taken
 *   - Cascading delete of audit rows. We keep audit rows (7-year
 *     retention) but unbind them from the user — `actor_user_id`
 *     becomes NULL on hard-delete. Forensic + legal-hold purposes
 *     require we keep the EVENT, just not the actor identity. The
 *     hard-delete path performs this null-out before deleting the
 *     `users` row.
 *   - Streaming exports. v1 bounds via `ACCOUNT_EXPORT_AUDIT_CAP`.
 *     A user above the cap sees `auditTruncated: true` and can
 *     request additional pages via an out-of-band admin process.
 */
import { and, eq, isNotNull, lte, sql, desc, isNull } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import type {
  AccountDeletionRequest,
  AccountDeletionResult,
  AccountExport,
  AccountExportAuditEvent,
  AccountExportHomeownerLink,
  AccountExportMembership,
  AccountExportNotification,
  AccountExportSubLink,
  AccountExportSubscription,
  AccountPurgeResult,
  IAccountService,
} from '../../shared/contracts/account'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  ACCOUNT_EXPORT_AUDIT_CAP,
  REDACTED_ACTOR,
  SoleAdminError,
} from '../../shared/contracts/account'
import { getDb } from '../db/client'
import { users, memberships } from '../db/schema/users'
import { organizations } from '../db/schema/organizations'
import { homeownerUsers } from '../db/schema/homeowner_users'
import { properties } from '../db/schema/properties'
import { subcontractorUsers } from '../db/schema/subcontractor_users'
import { subcontractors } from '../db/schema/subcontractors'
import { notifications } from '../db/schema/notifications'
import { notificationSubscriptions } from '../db/schema/notification_subscriptions'
import { auditLog } from '../db/schema/audit_log'
import { withAudit } from './_tx'
import type { TenantResolver } from './_tenant'

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export class RealAccountService implements IAccountService {
  // Accept tenantResolver for factory-parity with sibling services, but discard it:
  // account export/delete are intentionally user-scoped (cross-tenant for users with
  // multi-org membership). Underscore-prefix satisfies noUnusedParameters.
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- preserves factory signature parity (see services-factory.ts)
  constructor(_tenantResolver?: TenantResolver) {}

  async exportPersonalData(userId: string): Promise<AccountExport> {
    const db = getDb()

    const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!userRow) throw new Error(`User ${userId} not found`)

    const memRows = await db
      .select({
        organizationId: memberships.organizationId,
        organizationName: organizations.name,
        role: memberships.role,
        isActive: memberships.isActive,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.userId, userId))

    const homeRows = await db
      .select({
        id: homeownerUsers.id,
        organizationId: homeownerUsers.organizationId,
        propertyId: homeownerUsers.propertyId,
        propertyAddress: properties.addressLine1,
        kind: homeownerUsers.kind,
        invitedAt: homeownerUsers.invitedAt,
        acceptedAt: homeownerUsers.acceptedAt,
      })
      .from(homeownerUsers)
      .leftJoin(properties, eq(properties.id, homeownerUsers.propertyId))
      .where(eq(homeownerUsers.userId, userId))

    const subRows = await db
      .select({
        id: subcontractorUsers.id,
        organizationId: subcontractorUsers.organizationId,
        subcontractorId: subcontractorUsers.subcontractorId,
        subName: subcontractors.companyName,
        invitedAt: subcontractorUsers.invitedAt,
        acceptedAt: subcontractorUsers.acceptedAt,
      })
      .from(subcontractorUsers)
      .leftJoin(subcontractors, eq(subcontractors.id, subcontractorUsers.subcontractorId))
      .where(eq(subcontractorUsers.userId, userId))

    const notifRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(ACCOUNT_EXPORT_AUDIT_CAP)

    const subscriptionRows = await db
      .select()
      .from(notificationSubscriptions)
      .where(eq(notificationSubscriptions.userId, userId))

    // +1 so we can detect the cap was hit without a second COUNT query.
    const auditRows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorUserId, userId))
      .orderBy(desc(auditLog.createdAt))
      .limit(ACCOUNT_EXPORT_AUDIT_CAP + 1)

    const truncated = auditRows.length > ACCOUNT_EXPORT_AUDIT_CAP
    const auditEvents: AccountExportAuditEvent[] = auditRows
      .slice(0, ACCOUNT_EXPORT_AUDIT_CAP)
      .map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        entityType: r.entityType,
        entityId: r.entityId,
        action: r.action,
        actorUserId: r.actorUserId!,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
      }))

    const memOut: AccountExportMembership[] = memRows.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      role: m.role,
      isActive: m.isActive,
      joinedAt: m.joinedAt.toISOString(),
    }))

    const homeOut: AccountExportHomeownerLink[] = homeRows.map((h) => ({
      homeownerUserId: h.id,
      organizationId: h.organizationId,
      propertyId: h.propertyId,
      propertyAddress: h.propertyAddress ?? null,
      kind: h.kind,
      invitedAt: h.invitedAt.toISOString(),
      acceptedAt: h.acceptedAt ? h.acceptedAt.toISOString() : null,
    }))

    const subOut: AccountExportSubLink[] = subRows.map((s) => ({
      subcontractorUserId: s.id,
      organizationId: s.organizationId,
      subcontractorId: s.subcontractorId,
      subcontractorName: s.subName ?? null,
      invitedAt: s.invitedAt.toISOString(),
      acceptedAt: s.acceptedAt ? s.acceptedAt.toISOString() : null,
    }))

    const notifOut: AccountExportNotification[] = notifRows.map((n) => ({
      id: n.id,
      organizationId: n.organizationId,
      eventType: n.eventType,
      title: n.title,
      body: n.body,
      severity: n.severity,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    }))

    const subsOut: AccountExportSubscription[] = subscriptionRows.map((s) => ({
      organizationId: s.organizationId,
      eventType: s.eventType,
      channels: {
        inApp: !!s.channels.inApp,
        email: !!s.channels.email,
        sms: !!s.channels.sms,
      },
      updatedAt: s.updatedAt.toISOString(),
    }))

    return {
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
      notice:
        `This export contains your personal data only. Activity authored by ` +
        `other users is redacted to "${REDACTED_ACTOR}".`,
      profile: {
        userId: userRow.id,
        email: userRow.email,
        fullName: userRow.fullName,
        avatarUrl: userRow.avatarUrl,
        isActive: userRow.isActive,
        createdAt: userRow.createdAt.toISOString(),
        updatedAt: userRow.updatedAt.toISOString(),
        deletedAt: userRow.deletedAt ? userRow.deletedAt.toISOString() : null,
      },
      memberships: memOut,
      homeownerLinks: homeOut,
      subcontractorLinks: subOut,
      notifications: notifOut,
      notificationSubscriptions: subsOut,
      auditEvents,
      auditTruncated: truncated,
    }
  }

  async requestDeletion(input: AccountDeletionRequest): Promise<AccountDeletionResult> {
    const db = getDb()
    const [userRow] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1)
    if (!userRow) throw new Error(`User ${input.userId} not found`)

    // Sole-admin guard. For each org where this user is an active
    // org_admin, ensure at least one OTHER active org_admin exists.
    const adminRows = await db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.userId, input.userId),
          eq(memberships.role, 'org_admin'),
          eq(memberships.isActive, true),
          eq(users.isActive, true),
        ),
      )
    const orphans: string[] = []
    for (const a of adminRows) {
      const [otherCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.organizationId, a.organizationId),
            eq(memberships.role, 'org_admin'),
            eq(memberships.isActive, true),
            eq(users.isActive, true),
            sql`${memberships.userId} <> ${input.userId}`,
          ),
        )
      if ((otherCount?.n ?? 0) === 0) orphans.push(a.organizationId)
    }
    if (orphans.length > 0) throw new SoleAdminError(orphans)

    const now = new Date()
    const emailPlaceholder = `deleted-${sha256Hex(userRow.email).slice(0, 16)}@deleted.invalid`

    await withAudit(async ({ tx, audit }) => {
      await tx
        .update(users)
        .set({
          fullName: '',
          avatarUrl: null,
          passwordHash: null,
          email: emailPlaceholder,
          isActive: false,
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, input.userId))

      // Suspend memberships so revoked sessions don't authorize anything.
      await tx
        .update(memberships)
        .set({ isActive: false, updatedAt: now })
        .where(eq(memberships.userId, input.userId))

      // Audit a row per affected org so each tenant's audit trail
      // records the request.
      const orgs = [...new Set(adminRows.map((r) => r.organizationId))]
      const allMemberOrgs = await tx
        .select({ organizationId: memberships.organizationId })
        .from(memberships)
        .where(eq(memberships.userId, input.userId))
      for (const m of allMemberOrgs) {
        await audit.record({
          organizationId: m.organizationId,
          entityType: 'user',
          entityId: input.userId,
          action: 'state_change',
          actorUserId: input.userId,
          metadata: {
            kind: 'security.account_deletion_requested',
            reason: input.reason ?? null,
            graceDays: ACCOUNT_DELETION_GRACE_DAYS,
          },
        })
      }
      void orgs
    })

    const hardDeleteAt = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 86_400_000)
    return {
      userId: input.userId,
      softDeletedAt: now.toISOString(),
      hardDeleteScheduledFor: hardDeleteAt.toISOString(),
    }
  }

  async purgeExpiredDeletions(now?: Date): Promise<AccountPurgeResult> {
    const ref = now ?? new Date()
    const cutoff = new Date(ref.getTime() - ACCOUNT_DELETION_GRACE_DAYS * 86_400_000)
    const db = getDb()

    const candidates = await db
      .select({ id: users.id })
      .from(users)
      .where(and(isNotNull(users.deletedAt), lte(users.deletedAt, cutoff)))

    if (candidates.length === 0) {
      return {
        scannedAt: ref.toISOString(),
        candidateCount: 0,
        purgedCount: 0,
      }
    }

    let purged = 0
    for (const c of candidates) {
      // Null out actor on audit rows so the event survives but the
      // identity does not (retention-policy decision).
      await db
        .update(auditLog)
        .set({ actorUserId: null })
        .where(eq(auditLog.actorUserId, c.id))
      // Null out invitedByUserId on homeowner/sub joins is not
      // necessary — those are scoped joins that we hard-delete.
      // Cascade-deletes on notifications + notification_subscriptions
      // fire automatically (FK ON DELETE CASCADE).
      await db.delete(homeownerUsers).where(eq(homeownerUsers.userId, c.id))
      await db.delete(subcontractorUsers).where(eq(subcontractorUsers.userId, c.id))
      await db.delete(memberships).where(eq(memberships.userId, c.id))
      await db.delete(users).where(eq(users.id, c.id))
      purged += 1
    }

    return {
      scannedAt: ref.toISOString(),
      candidateCount: candidates.length,
      purgedCount: purged,
    }
  }
}

void isNull // silence unused-import if future edits trim queries

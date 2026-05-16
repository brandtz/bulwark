/**
 * server/services/notification.real.ts — RealNotificationService
 * (W3-1 / EH-J / ADR-0027).
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - `enqueue` writes a `notifications` row AND an `audit_log` row
 *     in the same transaction via `withAudit`. The audit kind is
 *     `notification.enqueued` (carried in metadata) — this lets the
 *     audit-log page show "who got what" without joining a separate
 *     table.
 *   - `listForUser` resolves the active org from the tenant resolver
 *     and filters by it. We deliberately do NOT pass an
 *     `organizationId` arg through the contract — a user is in
 *     exactly one active org per request; flowing both would invite
 *     mistakes.
 *   - `unreadCountForUser` is a single `COUNT(*)` so the bell's
 *     30-second poll stays cheap.
 *   - `markRead` and `markAllRead` flip `readAt` only on rows owned
 *     by `userId` — no admin override path exists.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type {
  INotificationService,
  Notification,
  NotificationEnqueueInput,
  NotificationListOutput,
} from '../../shared/contracts/notification'
import { notifications, type NotificationRow } from '../db/schema/notifications'
import { getDb } from '../db/client'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: NotificationRow): Notification {
  return {
    id: r.id,
    organizationId: r.organizationId,
    userId: r.userId,
    eventType: r.eventType,
    title: r.title,
    body: r.body,
    severity: (r.severity as Notification['severity']) ?? 'info',
    relatedEntityType: r.relatedEntityType,
    relatedEntityId: r.relatedEntityId,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealNotificationService implements INotificationService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private requireOrg(): string {
    const ctx = this.tenantResolver?.()
    if (!ctx) throw new Error('No active session for notification service')
    return ctx.organizationId
  }

  async listForUser(
    userId: string,
    opts?: { unreadOnly?: boolean; page?: number; pageSize?: number },
  ): Promise<NotificationListOutput> {
    const orgId = this.requireOrg()
    const page = Math.max(1, opts?.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 50))
    const db = getDb()
    const baseConds = [
      eq(notifications.organizationId, orgId),
      eq(notifications.userId, userId),
    ]
    const unreadRow = await db
      .select({ unreadTotal: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(...baseConds, isNull(notifications.readAt)))
    const unreadTotal = unreadRow[0]?.unreadTotal ?? 0
    const filterConds = opts?.unreadOnly
      ? [...baseConds, isNull(notifications.readAt)]
      : baseConds
    const totalRow = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(...filterConds))
    const total = totalRow[0]?.total ?? 0
    const rows = await db
      .select()
      .from(notifications)
      .where(and(...filterConds))
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
    return {
      rows: rows.map(rowToContract),
      total: Number(total ?? 0),
      unreadTotal: Number(unreadTotal ?? 0),
      page,
      pageSize,
    }
  }

  async unreadCountForUser(userId: string): Promise<number> {
    const orgId = this.requireOrg()
    const db = getDb()
    const [r] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, orgId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      )
    return Number(r?.c ?? 0)
  }

  async markRead(id: string): Promise<void> {
    const orgId = this.requireOrg()
    const db = getDb()
    await db
      .update(notifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.organizationId, orgId)))
  }

  async markAllRead(userId: string): Promise<void> {
    const orgId = this.requireOrg()
    const db = getDb()
    await db
      .update(notifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(notifications.organizationId, orgId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      )
  }

  async enqueue(input: NotificationEnqueueInput): Promise<{ id: string }> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(notifications)
        .values({
          organizationId: input.organizationId,
          userId: input.userId,
          eventType: input.eventType,
          title: input.title,
          body: input.body ?? '',
          severity: input.severity ?? 'info',
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'notification',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: {
          kind: 'notification.enqueued',
          eventType: input.eventType,
          severity: input.severity ?? 'info',
        },
      })
      return { id: row!.id }
    })
  }
}

/**
 * server/services/notification-subscription.real.ts (W2-4 / EH-H Part B).
 *
 * # Decisions (ADR-0008)
 *   - One row per (org, user, eventType). Upsert by the
 *     `notification_subscriptions_org_user_event_unique` index.
 *   - `resetToDefaults` wipes the user's rows and re-seeds from
 *     `NOTIFICATION_DEFAULTS`. Used by the "Reset to defaults" button
 *     on `/profile/notifications` and by the invite-accept seed hook.
 */
import { and, desc, eq } from 'drizzle-orm'
import type {
  INotificationSubscriptionService,
  NotificationSubscription,
  NotificationSubscriptionBulkInput,
  NotificationSubscriptionUpsertInput,
} from '../../shared/contracts/notification-subscription'
import { NOTIFICATION_DEFAULTS } from '../../shared/contracts/notification-subscription'
import { notificationSubscriptions } from '../db/schema/notification_subscriptions'
import type { NotificationSubscriptionRow } from '../db/schema/notification_subscriptions'
import { getDb } from '../db/client'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: NotificationSubscriptionRow): NotificationSubscription {
  return {
    id: r.id,
    organizationId: r.organizationId,
    userId: r.userId,
    eventType: r.eventType,
    channels: r.channels,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealNotificationSubscriptionService
  implements INotificationSubscriptionService
{
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(organizationId: string): Promise<{ rows: NotificationSubscription[] }> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(notificationSubscriptions)
      .where(eq(notificationSubscriptions.organizationId, organizationId))
      .orderBy(desc(notificationSubscriptions.createdAt))
    return { rows: rows.map(rowToContract) }
  }

  async listForUser(
    organizationId: string,
    userId: string,
  ): Promise<{ rows: NotificationSubscription[] }> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.organizationId, organizationId),
          eq(notificationSubscriptions.userId, userId),
        ),
      )
    return { rows: rows.map(rowToContract) }
  }

  async upsert(
    input: NotificationSubscriptionUpsertInput,
  ): Promise<NotificationSubscription> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const [existing] = await db
      .select()
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.organizationId, input.organizationId),
          eq(notificationSubscriptions.userId, input.userId),
          eq(notificationSubscriptions.eventType, input.eventType),
        ),
      )
      .limit(1)

    if (existing) {
      const [row] = await db
        .update(notificationSubscriptions)
        .set({ channels: input.channels, updatedAt: new Date() })
        .where(eq(notificationSubscriptions.id, existing.id))
        .returning()
      return rowToContract(row!)
    }
    const [row] = await db
      .insert(notificationSubscriptions)
      .values({
        organizationId: input.organizationId,
        userId: input.userId,
        eventType: input.eventType,
        channels: input.channels,
      })
      .returning()
    return rowToContract(row!)
  }

  async bulkUpsert(
    input: NotificationSubscriptionBulkInput,
  ): Promise<{ rows: NotificationSubscription[] }> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const rows: NotificationSubscription[] = []
    for (const entry of input.entries) {
      const r = await this.upsert({
        organizationId: input.organizationId,
        userId: input.userId,
        eventType: entry.eventType,
        channels: entry.channels,
      })
      rows.push(r)
    }
    return { rows }
  }

  async resetToDefaults(
    organizationId: string,
    userId: string,
  ): Promise<{ rows: NotificationSubscription[] }> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      await tx
        .delete(notificationSubscriptions)
        .where(
          and(
            eq(notificationSubscriptions.organizationId, organizationId),
            eq(notificationSubscriptions.userId, userId),
          ),
        )
      const inserted: NotificationSubscriptionRow[] = []
      for (const def of NOTIFICATION_DEFAULTS) {
        const [row] = await tx
          .insert(notificationSubscriptions)
          .values({
            organizationId,
            userId,
            eventType: def.eventType,
            channels: def.channels,
          })
          .returning()
        inserted.push(row!)
      }
      await audit.record({
        organizationId,
        entityType: 'notification_subscriptions',
        entityId: userId,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'reset_to_defaults', count: inserted.length },
      })
      return { rows: inserted.map(rowToContract) }
    })
  }
}

/**
 * Public helper used by the accept-invite path to seed a fresh user.
 * Lives here so the orchestration uses the same tx-aware insert path.
 */
export async function seedDefaultNotifications(opts: {
  organizationId: string
  userId: string
}): Promise<void> {
  const db = getDb()
  for (const def of NOTIFICATION_DEFAULTS) {
    await db
      .insert(notificationSubscriptions)
      .values({
        organizationId: opts.organizationId,
        userId: opts.userId,
        eventType: def.eventType,
        channels: def.channels,
      })
      .onConflictDoNothing()
  }
}

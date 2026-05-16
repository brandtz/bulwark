/**
 * shared/mocks/notification-subscription.mock.ts —
 * MockNotificationSubscriptionService (W2-4 / EH-H Part B / ADR-0021).
 *
 * # Decisions (ADR-0008)
 *   - Module-level row store. `resetToDefaults` clears the user's rows
 *     and seeds the catalog with `NOTIFICATION_DEFAULTS`.
 *   - `bulkUpsert` is the wire used by the page's "Save" button.
 */
import {
  NOTIFICATION_DEFAULTS,
  type INotificationSubscriptionService,
  type NotificationSubscription,
  type NotificationSubscriptionBulkInput,
  type NotificationSubscriptionUpsertInput,
} from '../contracts/notification-subscription'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: NotificationSubscription[] = []

function findRow(orgId: string, userId: string, eventType: string): NotificationSubscription | undefined {
  return rows.find(
    (r) => r.organizationId === orgId && r.userId === userId && r.eventType === eventType,
  )
}

export class MockNotificationSubscriptionService
  implements INotificationSubscriptionService
{
  constructor(private readonly resolver?: TenantResolver) {}

  async list(organizationId: string): Promise<{ rows: NotificationSubscription[] }> {
    assertSameTenant(this.resolver, organizationId)
    return { rows: rows.filter((r) => r.organizationId === organizationId) }
  }

  async listForUser(
    organizationId: string,
    userId: string,
  ): Promise<{ rows: NotificationSubscription[] }> {
    assertSameTenant(this.resolver, organizationId)
    return {
      rows: rows.filter((r) => r.organizationId === organizationId && r.userId === userId),
    }
  }

  async upsert(
    input: NotificationSubscriptionUpsertInput,
  ): Promise<NotificationSubscription> {
    assertSameTenant(this.resolver, input.organizationId)
    const now = new Date().toISOString()
    const existing = findRow(input.organizationId, input.userId, input.eventType)
    if (existing) {
      existing.channels = input.channels
      existing.updatedAt = now
      return existing
    }
    const row: NotificationSubscription = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      eventType: input.eventType,
      channels: input.channels,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async bulkUpsert(
    input: NotificationSubscriptionBulkInput,
  ): Promise<{ rows: NotificationSubscription[] }> {
    assertSameTenant(this.resolver, input.organizationId)
    const out: NotificationSubscription[] = []
    for (const e of input.entries) {
      out.push(
        await this.upsert({
          organizationId: input.organizationId,
          userId: input.userId,
          eventType: e.eventType,
          channels: e.channels,
        }),
      )
    }
    return { rows: out }
  }

  async resetToDefaults(
    organizationId: string,
    userId: string,
  ): Promise<{ rows: NotificationSubscription[] }> {
    assertSameTenant(this.resolver, organizationId)
    // Drop the user's rows, then re-seed defaults.
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]!
      if (r.organizationId === organizationId && r.userId === userId) rows.splice(i, 1)
    }
    return this.bulkUpsert({
      organizationId,
      userId,
      entries: NOTIFICATION_DEFAULTS.map((d) => ({
        eventType: d.eventType,
        channels: d.channels,
      })),
    })
  }
}

export function __resetMockNotificationSubsForTests(): void {
  rows.length = 0
}

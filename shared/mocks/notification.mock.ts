/**
 * shared/mocks/notification.mock.ts — MockNotificationService
 * (W3-1 / EH-J / ADR-0027).
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - Module-level row store. Tenant-firewalled via the standard
 *     `assertSameTenant` helper, but `listForUser` accepts only a
 *     `userId` (per the contract) — the firewall reads the active org
 *     off the resolver and filters by that.
 *   - `enqueue` accepts the same input the real service does; the
 *     mock does NOT route through any audit-log mock. Tests that
 *     care about audit assert on the real path.
 *   - `markRead` / `markAllRead` mutate in place.
 */
import type {
  INotificationService,
  Notification,
  NotificationEnqueueInput,
  NotificationListOutput,
} from '../contracts/notification'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: Notification[] = []

export class MockNotificationService implements INotificationService {
  constructor(private readonly resolver?: TenantResolver) {}

  private orgId(): string | null {
    return this.resolver?.()?.organizationId ?? null
  }

  async listForUser(
    userId: string,
    opts?: { unreadOnly?: boolean; page?: number; pageSize?: number },
  ): Promise<NotificationListOutput> {
    const orgId = this.orgId()
    if (orgId) assertSameTenant(this.resolver, orgId)
    const page = opts?.page ?? 1
    const pageSize = opts?.pageSize ?? 50
    let scope = rows.filter((r) => r.userId === userId && (!orgId || r.organizationId === orgId))
    const unreadTotal = scope.filter((r) => r.readAt === null).length
    if (opts?.unreadOnly) scope = scope.filter((r) => r.readAt === null)
    scope = [...scope].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const total = scope.length
    const start = (page - 1) * pageSize
    const slice = scope.slice(start, start + pageSize)
    return { rows: slice, total, unreadTotal, page, pageSize }
  }

  async unreadCountForUser(userId: string): Promise<number> {
    const orgId = this.orgId()
    return rows.filter(
      (r) => r.userId === userId && r.readAt === null && (!orgId || r.organizationId === orgId),
    ).length
  }

  async markRead(id: string): Promise<void> {
    const r = rows.find((row) => row.id === id)
    if (!r) return
    if (r.readAt === null) r.readAt = new Date().toISOString()
  }

  async markAllRead(userId: string): Promise<void> {
    const orgId = this.orgId()
    const now = new Date().toISOString()
    for (const r of rows) {
      if (r.userId !== userId) continue
      if (orgId && r.organizationId !== orgId) continue
      if (r.readAt === null) r.readAt = now
    }
  }

  async enqueue(input: NotificationEnqueueInput): Promise<{ id: string }> {
    assertSameTenant(this.resolver, input.organizationId)
    const now = new Date().toISOString()
    const row: Notification = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      eventType: input.eventType,
      title: input.title,
      body: input.body ?? '',
      severity: input.severity ?? 'info',
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      readAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return { id: row.id }
  }
}

export function __resetMockNotificationsForTests(): void {
  rows.length = 0
}

/** Test-only: peek at the underlying store. */
export function __peekMockNotifications(): readonly Notification[] {
  return rows
}

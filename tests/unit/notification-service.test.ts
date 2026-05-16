/**
 * tests/unit/notification-service.test.ts — W3-1.
 *
 * Mock-level notification service surface: enqueue + listForUser +
 * markRead + markAllRead + unreadCountForUser.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MockNotificationService,
  __resetMockNotificationsForTests,
} from '~~/shared/mocks/notification.mock'
import { FIXTURE_ORG_ID, FIXTURE_USER_ADMIN } from '~~/shared/mocks/fixtures'
import type { TenantResolver } from '~~/shared/mocks/tenant'

const resolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

beforeEach(() => {
  __resetMockNotificationsForTests()
})

async function seed(svc: MockNotificationService, n: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const r = await svc.enqueue({
      organizationId: FIXTURE_ORG_ID,
      userId: FIXTURE_USER_ADMIN.userId,
      eventType: 'quote.accepted',
      title: `Notification #${i}`,
      body: 'body',
      severity: 'success',
    })
    ids.push(r.id)
  }
  return ids
}

describe('MockNotificationService', () => {
  it('enqueue creates an unread row', async () => {
    const svc = new MockNotificationService(resolver)
    const { id } = await svc.enqueue({
      organizationId: FIXTURE_ORG_ID,
      userId: FIXTURE_USER_ADMIN.userId,
      eventType: 'quote.accepted',
      title: 'Hello',
      body: 'World',
      severity: 'info',
    })
    expect(id).toBeTruthy()
    const list = await svc.listForUser(FIXTURE_USER_ADMIN.userId)
    expect(list.total).toBe(1)
    expect(list.unreadTotal).toBe(1)
    expect(list.rows[0]!.readAt).toBeNull()
  })

  it('unreadCountForUser counts only unread', async () => {
    const svc = new MockNotificationService(resolver)
    const ids = await seed(svc, 3)
    expect(await svc.unreadCountForUser(FIXTURE_USER_ADMIN.userId)).toBe(3)
    await svc.markRead(ids[0]!)
    expect(await svc.unreadCountForUser(FIXTURE_USER_ADMIN.userId)).toBe(2)
  })

  it('listForUser paginates + filters unreadOnly', async () => {
    const svc = new MockNotificationService(resolver)
    const ids = await seed(svc, 5)
    await svc.markRead(ids[0]!)
    await svc.markRead(ids[1]!)
    const all = await svc.listForUser(FIXTURE_USER_ADMIN.userId, { page: 1, pageSize: 2 })
    expect(all.total).toBe(5)
    expect(all.rows.length).toBe(2)
    const unread = await svc.listForUser(FIXTURE_USER_ADMIN.userId, { unreadOnly: true })
    expect(unread.total).toBe(3)
    for (const row of unread.rows) expect(row.readAt).toBeNull()
  })

  it('markAllRead flips every unread row', async () => {
    const svc = new MockNotificationService(resolver)
    await seed(svc, 4)
    await svc.markAllRead(FIXTURE_USER_ADMIN.userId)
    expect(await svc.unreadCountForUser(FIXTURE_USER_ADMIN.userId)).toBe(0)
  })
})

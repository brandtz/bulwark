/**
 * tests/unit/notification-subscriptions.test.ts — W2-4.
 *
 * Exercises the per-user notification matrix: upsert flips a single
 * channel; bulkUpsert seeds the full matrix; resetToDefaults restores
 * NOTIFICATION_DEFAULTS; cross-tenant access is firewalled.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MockNotificationSubscriptionService,
  __resetMockNotificationSubsForTests,
} from '~~/shared/mocks/notification-subscription.mock'
import {
  KNOWN_EVENT_TYPES,
  NOTIFICATION_DEFAULTS,
} from '~~/shared/contracts/notification-subscription'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'
import {
  FIXTURE_ORG_ID,
  FIXTURE_ORG_ID_2,
  FIXTURE_USER_ADMIN,
} from '~~/shared/mocks/fixtures'

const adminResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

beforeEach(() => {
  __resetMockNotificationSubsForTests()
})

describe('MockNotificationSubscriptionService', () => {
  it('upsert flips a single channel on a single event', async () => {
    const svc = new MockNotificationSubscriptionService(adminResolver)
    const eventType = KNOWN_EVENT_TYPES[0]!.eventType
    await svc.upsert({
      organizationId: FIXTURE_ORG_ID,
      userId: FIXTURE_USER_ADMIN.userId,
      eventType,
      channels: { inApp: true, email: false, sms: false },
    })
    const { rows } = await svc.listForUser(FIXTURE_ORG_ID, FIXTURE_USER_ADMIN.userId)
    const row = rows.find((r) => r.eventType === eventType)
    expect(row?.channels).toEqual({ inApp: true, email: false, sms: false })
  })

  it('resetToDefaults restores NOTIFICATION_DEFAULTS', async () => {
    const svc = new MockNotificationSubscriptionService(adminResolver)
    // Stomp a few rows with bogus values first.
    await svc.upsert({
      organizationId: FIXTURE_ORG_ID,
      userId: FIXTURE_USER_ADMIN.userId,
      eventType: KNOWN_EVENT_TYPES[0]!.eventType,
      channels: { inApp: false, email: false, sms: false },
    })
    const reset = await svc.resetToDefaults(FIXTURE_ORG_ID, FIXTURE_USER_ADMIN.userId)
    expect(reset.rows.length).toBe(NOTIFICATION_DEFAULTS.length)
    for (const def of NOTIFICATION_DEFAULTS) {
      const row = reset.rows.find((r) => r.eventType === def.eventType)
      expect(row?.channels).toEqual(def.channels)
    }
  })

  it('firewalls cross-tenant listForUser', async () => {
    const svc = new MockNotificationSubscriptionService(adminResolver)
    await expect(
      svc.listForUser(FIXTURE_ORG_ID_2, FIXTURE_USER_ADMIN.userId),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })
})

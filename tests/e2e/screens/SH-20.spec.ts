/**
 * SH-20 — Notifications feed.
 * Source design: agents/design/return/design-return/A/screens/SH-20-notifications-feed/SPEC.md
 */
import { test, expect, type Page } from '@playwright/test'
import { describeScreen, dismissUnsyncedWorkWarning, PERSONAS } from './_contract'
import { signIn, waitForHydration } from '../_helpers'

const route = '/notifications'

type NotificationSeed = { title: string; severity: 'info' | 'success' | 'warning' | 'error' }
type NotificationFixtureAction = 'seed' | 'delay' | 'fail'

async function configureMockNotifications(
  page: Page,
  action: NotificationFixtureAction,
  notifications: NotificationSeed[] = [],
) {
  await page.evaluate(async ({ action: fixtureAction, notifications: seeds }) => {
    type Severity = NotificationSeed['severity']
    type NotificationService = {
      enqueue: (input: {
        organizationId: string
        userId: string
        eventType: string
        title: string
        body: string
        severity: Severity
        relatedEntityType: null
        relatedEntityId: null
      }) => Promise<unknown>
      listForUser: (userId: string, options?: Record<string, unknown>) => Promise<unknown>
    }
    type NuxtBridge = { $services?: { notification?: NotificationService } }
    type VueRoot = HTMLElement & {
      __vue_app__?: { config: { globalProperties: { $nuxt?: NuxtBridge } } }
    }
    type Runtime = Window & {
      __NUXT__?: { state?: Record<string, unknown> }
    }

    const root = document.querySelector('#__nuxt') as VueRoot | null
    const service = root?.__vue_app__?.config.globalProperties.$nuxt?.$services?.notification
    const session = (window as Runtime).__NUXT__?.state?.['$sbulwark.session'] as {
      userId?: string
      activeOrganizationId?: string
    } | undefined
    if (!service || !session?.userId || !session.activeOrganizationId) {
      throw new Error('Mock notification fixture service or session is unavailable')
    }

    if (fixtureAction === 'seed') {
      for (const notification of seeds) {
        await service.enqueue({
          organizationId: session.activeOrganizationId,
          userId: session.userId,
          eventType: 'screen.contract',
          title: notification.title,
          body: 'Notification feed screen fixture',
          severity: notification.severity,
          relatedEntityType: null,
          relatedEntityId: null,
        })
      }
    } else if (fixtureAction === 'delay') {
      const listForUser = service.listForUser.bind(service)
      service.listForUser = async (userId, options) => {
        await new Promise((resolve) => window.setTimeout(resolve, 900))
        return listForUser(userId, options)
      }
    } else {
      service.listForUser = async () => {
        throw new Error('Notification service unavailable')
      }
    }
  }, { action, notifications })
}

async function navigateInApp(page: Page, path: string, waitUntilReady = true) {
  const navigation = page.waitForURL(`**${path}`)
  await page.evaluate((target) => {
    type VueRoot = HTMLElement & {
      __vue_app__?: { config: { globalProperties: { $router?: { push: (to: string) => Promise<unknown> } } } }
    }
    const root = document.querySelector('#__nuxt') as VueRoot | null
    const router = root?.__vue_app__?.config.globalProperties.$router
    if (!router) throw new Error('Nuxt router is unavailable')
    void router.push(target)
  }, path)
  await navigation
  if (waitUntilReady) await waitForHydration(page)
}

async function createUnreadNotification(page: Page, notifications: NotificationSeed[] = [
  { title: 'Screen contract unread notification', severity: 'info' },
]) {
  await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
  await dismissUnsyncedWorkWarning(page)
  await configureMockNotifications(page, 'seed', notifications)
  await navigateInApp(page, route)
}

describeScreen({
  id: 'SH-20',
  route,
  roles: ['super_admin', 'org_admin', 'org_manager', 'field', 'viewer', 'sub_contractor', 'homeowner', 'stakeholder'],
  viewports: ['desktop', 'mobile'],
  testIds: ['notifications-page', 'notifications-filter-unread'],
}, () => {
  test.describe('states (from SPEC)', () => {
    test('state: Default — unread notifications are counted and visibly marked', async ({ page }) => {
      await createUnreadNotification(page)
      await expect(page.getByTestId('notifications-page')).toBeVisible()
      const summary = page.getByTestId('notifications-summary')
      await expect(summary).toContainText('1 unread')
      await expect(summary).toContainText('1 total')
      const unreadRows = page.getByTestId('notifications-row').filter({ hasText: 'New' })
      await expect(unreadRows.first()).toBeVisible()
      await expect(page.getByTestId('notifications-filter-severity')).toBeVisible()
    })

    test('state: Unread only — read rows disappear when the filter is enabled', async ({ page }) => {
      await createUnreadNotification(page)
      const firstRow = page.getByTestId('notifications-row').first()
      await expect(firstRow).toBeVisible()
      await firstRow.click()
      await expect(page.getByTestId('notifications-row').filter({ hasText: 'New' })).toHaveCount(0)

      await page.getByTestId('notifications-filter-unread').check()
      await expect(page.getByTestId('notifications-filter-unread')).toBeChecked()
      await expect(page.getByTestId('notifications-row')).toHaveCount(0)
    })

    test('state: Filtered — severity selection excludes rows with a different severity', async ({ page }) => {
      await createUnreadNotification(page, [
        { title: 'Successful notification', severity: 'success' },
        { title: 'Informational notification', severity: 'info' },
      ])
      const rows = page.getByTestId('notifications-row')
      await expect(rows.first()).toBeVisible()
      await page.getByTestId('notifications-filter-severity').selectOption('success')
      await expect(rows).toHaveCount(1)
      await expect(rows.first()).toContainText('Successful notification')
      await expect(page.getByTestId('notifications-empty')).not.toBeVisible()
    })

    test('state: Loading — the feed exposes busy feedback while its request is pending', async ({ page }) => {
      await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' })
      await waitForHydration(page)
      await dismissUnsyncedWorkWarning(page)
      await configureMockNotifications(page, 'delay')
      await navigateInApp(page, route, false)
      await expect(page.getByText('Loading…')).toBeVisible()
      await expect(page.getByTestId('notifications-row')).toHaveCount(0)
    })

    test('state: Empty — an account without notifications gets the empty state and preferences link', async ({ page, context }) => {
      await signIn(context, PERSONAS.homeowner!)
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await waitForHydration(page)
      await dismissUnsyncedWorkWarning(page)
      await expect(page.getByTestId('notifications-empty')).toContainText('All caught up.')
      await expect(page.getByTestId('notifications-row')).toHaveCount(0)
      await expect(page.getByRole('link', { name: /preferences/i })).toBeVisible()
    })

    test('state: Error — a failed feed request shows a danger message and Retry', async ({ page }) => {
      await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' })
      await waitForHydration(page)
      await dismissUnsyncedWorkWarning(page)
      await configureMockNotifications(page, 'fail')
      await navigateInApp(page, route, false)
      await expect(page.getByTestId('notifications-error')).toContainText('Could not load notifications.')
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    })

    test('state: New arrival — a newly enqueued row appears when the feed is reopened', async ({ page }) => {
      await createUnreadNotification(page)
      const initialCount = await page.getByTestId('notifications-row').count()
      await configureMockNotifications(page, 'seed', [
        { title: 'Newly arrived notification', severity: 'success' },
      ])
      await navigateInApp(page, '/admin/dashboard')
      await navigateInApp(page, route)
      await expect(page.getByTestId('notifications-row')).toHaveCount(initialCount + 1)
      await expect(page.getByText('Newly arrived notification')).toBeVisible()
    })
  })

  test.describe('actions (from SPEC)', () => {
    test('action: Mark All Read — clears unread styling and the displayed unread count', async ({ page }) => {
      await createUnreadNotification(page)
      await expect(page.getByTestId('notifications-row').filter({ hasText: 'New' }).first()).toBeVisible()
      await page.getByTestId('notifications-mark-all-read').click()
      const summary = page.getByTestId('notifications-summary')
      await expect(summary).toContainText('0 unread')
      await expect(summary).toContainText('1 total')
      await expect(page.getByTestId('notifications-row').filter({ hasText: 'New' })).toHaveCount(0)
    })

    test('action: Preferences — feed provides a direct route to notification settings', async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await waitForHydration(page)
      await dismissUnsyncedWorkWarning(page)
      await page.getByRole('link', { name: /preferences/i }).click()
      await expect(page).toHaveURL(/\/profile\/notifications$/)
    })
  })
})

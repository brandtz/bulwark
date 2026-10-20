/**
 * SH-10 — Mobile More menu.
 * Source design: agents/design/return/design-return/A/screens/SH-10-mobile-more-menu/SPEC.md
 */
import { test, expect } from '@playwright/test'
import { describeScreen, dismissUnsyncedWorkWarning, PERSONAS } from './_contract'
import { signIn, waitForHydration } from '../_helpers'

const route = '/admin/dashboard'

async function openAdminMore(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
  await dismissUnsyncedWorkWarning(page)
  await page.getByTestId('mobile-more-button').click()
  await expect(page.getByTestId('mobile-more-sheet')).toBeVisible()
}

describeScreen({
  id: 'SH-10',
  route,
  roles: ['super_admin', 'org_admin', 'org_manager'],
  viewports: ['desktop', 'mobile'],
  testIds: ['mobile-bottom-nav', 'mobile-more-button'],
}, () => {
  test.describe('states (from SPEC)', () => {
    test('state: Admin — overflow destinations are separate from the primary tabs', async ({ page }) => {
      await openAdminMore(page)
      const bottomNav = page.getByTestId('mobile-bottom-nav')
      const sheet = page.getByTestId('mobile-more-sheet')
      const tabs = bottomNav.locator('a, button')
      const overflow = sheet.locator('ul[aria-label="More navigation"] > li')

      await expect(tabs).toHaveCount(5)
      await expect(overflow).toHaveCount(8)
      await expect(sheet.getByText('Theme', { exact: true })).toBeVisible()
      await expect(sheet.getByTestId('more-sheet-sign-out')).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeHidden()
    })

    test('state: Field — Sync queue, time clock and check-in use the field shell navigation', async ({ page, context }) => {
      await signIn(context, PERSONAS.field!)
      await page.addInitScript(() => {
        localStorage.setItem('bulwark.offline-queue.field-check-in', JSON.stringify({
          items: [{ url: '/api/field/check-in', method: 'POST', body: {}, attempts: 0 }],
        }))
      })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/profile', { waitUntil: 'domcontentloaded' })
      await waitForHydration(page)
      await dismissUnsyncedWorkWarning(page)
      await page.getByTestId('mobile-more-button').click()
      const sheet = page.getByTestId('mobile-more-sheet')
      await expect(sheet.getByRole('link', { name: 'Sync queue' })).toBeVisible()
      await expect(sheet.getByTestId('sync-queue-count')).toHaveText('1')
      await expect(sheet.getByRole('link', { name: 'Time clock' })).toBeVisible()
      await expect(sheet.getByRole('link', { name: 'Check in to job' })).toBeVisible()

      await page.goto('/field/dashboard', { waitUntil: 'domcontentloaded' })
      await waitForHydration(page)
      await dismissUnsyncedWorkWarning(page)

      await expect(page.getByTestId('field-layout')).toBeVisible()
      await expect(page.getByTestId('field-tabs')).toBeVisible()
      await expect(page.getByTestId('field-tab-my-day')).toBeVisible()
      await expect(page.getByTestId('field-tab-check-in')).toBeVisible()
      await expect(page.getByTestId('field-sync-queue-count')).toHaveText('1 queued')
      await page.getByTestId('field-link-sync').click()
      await waitForHydration(page)
      await expect(page.getByTestId('field-sync-queue')).toBeVisible()
      await expect(page.getByText('1 check-in update pending.')).toBeVisible()
      await page.goto('/field/check-in', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('field-check-in-in')).toBeVisible()
      await expect(page.getByTestId('field-check-in-out')).toBeVisible()
    })

    test('state: Multi-org — Switch org appears for a multi-membership session only', async ({ page, context }) => {
      await signIn(context, PERSONAS.super_admin!)
      await openAdminMore(page)
      await expect(page.getByTestId('more-sheet-switch-org')).toBeVisible()
      await expect(page.getByTestId('more-sheet-switch-org')).toHaveAttribute('href', '/org-switcher')
    })
  })

  test.describe('actions (from SPEC)', () => {
    test('action: Theme — Dark applies immediately and survives a reload', async ({ page }) => {
      await openAdminMore(page)
      await page.getByTestId('mobile-more-sheet').getByRole('tab', { name: 'Dark' }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await openAdminMore(page)
      await expect(page.getByTestId('mobile-more-sheet').getByRole('tab', { name: 'Dark' }))
        .toHaveAttribute('aria-selected', 'true')
    })

    test('action: Nav item — Dispatch opens its destination and closes More', async ({ page }) => {
      await openAdminMore(page)
      await page.getByTestId('mobile-more-sheet').getByRole('link', { name: 'Dispatch' }).click()
      await expect(page).toHaveURL(/\/admin\/dispatch$/)
      await expect(page.getByTestId('mobile-more-sheet')).toBeHidden()
      await expect(page.getByRole('heading', { name: 'Dispatch board' })).toBeVisible()
    })

    test('action: Sign out — More closes and the session returns to sign-in', async ({ page }) => {
      await openAdminMore(page)
      await page.getByTestId('more-sheet-sign-out').click()
      await expect(page).toHaveURL(/\/login(?:\?|$)/)
      await expect(page.getByTestId('mobile-more-sheet')).toBeHidden()
    })

    test('action: Sign out with queued work — warns, allows cancel or confirmation, and preserves the queue', async ({ page }) => {
      await openAdminMore(page)
      const queueKey = 'bulwark.offline-queue.field-check-in'
      await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
          items: [{ url: '/api/field/check-in', method: 'POST', body: { kind: 'in' }, attempts: 0 }],
        }))
      }, queueKey)

      await page.getByTestId('more-sheet-sign-out').click()
      const warning = page.getByRole('alertdialog', { name: 'Unsynced work' })
      await expect(warning).toBeVisible()
      await expect(warning.getByTestId('sign-out-queued-items')).toContainText('POST /api/field/check-in')
      await warning.getByTestId('sign-out-cancel').click()
      await expect(warning).toHaveCount(0)
      await expect(page).toHaveURL(/\/admin\/dashboard$/)

      await page.getByTestId('mobile-more-button').click()
      await page.getByTestId('more-sheet-sign-out').click()
      await page.getByTestId('sign-out-confirm').click()
      await expect(page).toHaveURL(/\/login(?:\?|$)/)
      const remaining = await page.evaluate((key) => localStorage.getItem(key), queueKey)
      if (!remaining) throw new Error('Queued work was removed during sign out')
      const storedQueue = JSON.parse(remaining) as { items: unknown[] }
      expect(storedQueue.items).toHaveLength(1)
    })
  })
})

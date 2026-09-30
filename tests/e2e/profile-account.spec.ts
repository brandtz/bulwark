/**
 * tests/e2e/profile-account.spec.ts — the signed-in user's own account pages.
 *
 * - /profile/notifications (WP-L07 self-binding, WP-X3 push): a channel toggle
 *   persists for the caller only; without VAPID keys the Push column and device
 *   card stay hidden.
 * - /profile/data (WP-L07 self-binding): export downloads the caller's own data;
 *   deletion stays behind a typed DELETE confirmation (cancelled here, never run).
 */
import { expect, test } from '@playwright/test'
import { signIn, signOut, waitForHydration } from './_helpers'

const USER = 'morgan@bulwark.demo'
const OTHER = 'vivian@bulwark.demo'

test.describe('own account pages (WP-L07, WP-X3)', () => {
  test.skip(process.env.BULWARK_BACKEND !== 'real', 'preferences and exports come from the real backend')
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop flow')

  test('a notification channel toggle persists for me and not for another user; no push without VAPID', async ({ page, browser }) => {
    await signIn(page.context(), USER)
    await page.goto('/profile/notifications')
    await waitForHydration(page)
    const row = page.getByTestId('notification-row').first()
    await expect(row).toBeVisible()
    const email = row.getByTestId('channel-email')
    const before = await email.isChecked()
    await email.click()
    await expect(email).toBeChecked({ checked: !before })
    await page.waitForLoadState('networkidle')

    await page.reload()
    await waitForHydration(page)
    await expect(page.getByTestId('notification-row').first().getByTestId('channel-email')).toBeChecked({ checked: !before })
    if (!process.env.VAPID_PUBLIC_KEY) {
      await expect(page.getByTestId('push-device')).toHaveCount(0)
      await expect(page.getByTestId('channel-push')).toHaveCount(0)
    }

    // Another user's defaults are untouched by my change.
    const other = await browser.newContext()
    try {
      await signIn(other, OTHER)
      const otherPage = await other.newPage()
      await otherPage.goto('/profile/notifications')
      await waitForHydration(otherPage)
      await expect(otherPage.getByTestId('notification-row').first().getByTestId('channel-email')).toBeChecked({ checked: before })
    } finally {
      await other.close()
    }

    // Restore defaults so the persona stays clean for other specs (reset asks via confirm()).
    page.once('dialog', (d) => { void d.accept() })
    await page.getByTestId('notifications-reset-button').click()
    await expect(page.getByTestId('notification-row').first().getByTestId('channel-email')).toBeChecked({ checked: before })
  })

  test('export downloads my own data; deletion needs the typed confirmation', async ({ page }) => {
    await signOut(page.context())
    await signIn(page.context(), USER)
    await page.goto('/profile/data')
    await waitForHydration(page)

    const download = page.waitForEvent('download')
    await page.getByTestId('account-export-button').click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^bulwark-export-[\w-]+-\d{4}-\d{2}-\d{2}\.json$/u)
    const body = JSON.parse(await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8')) as unknown
    const text = JSON.stringify(body)
    expect(text).toContain(USER)
    expect(text).not.toContain(OTHER)

    await page.getByTestId('account-delete-show-confirm').click()
    await expect(page.getByTestId('account-delete-confirm')).toBeVisible()
    await page.getByTestId('account-delete-confirm-input').fill('delete me')
    await page.getByTestId('account-delete-confirm-button').click()
    // Wrong phrase: nothing happens, still signed in on the page.
    await expect(page).toHaveURL(/\/profile\/data$/u)
    await page.getByTestId('account-delete-cancel').click()
    await expect(page.getByTestId('account-delete-confirm')).toHaveCount(0)
    await expect(page.getByTestId('account-export-card')).toBeVisible()
  })
})

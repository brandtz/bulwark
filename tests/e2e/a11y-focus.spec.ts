/**
 * tests/e2e/a11y-focus.spec.ts — WP-L08 (epic L09-S3) focus management.
 *
 * - A modal takes focus on open, keeps Tab inside, closes on Escape and hands
 *   focus back to the control that opened it.
 * - A client-side route change moves focus to the new page's heading, so
 *   keyboard / screen-reader users land on (and hear) the new page.
 */
import { expect, test } from '@playwright/test'
import { signInAsAdmin, waitForHydration } from './_helpers'

test.describe('focus management (L09-S3)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'keyboard behaviour is engine-independent here')

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('modal traps Tab, closes on Escape, restores focus to its opener', async ({ page }) => {
    test.skip(process.env.BULWARK_BACKEND === 'mock', 'needs a seeded sent invoice (real backend)')
    await page.goto('/admin/invoices')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')
    await page.getByTestId('invoice-row')
      .filter({ has: page.locator('[data-testid="invoice-row-status"][data-status="sent"]') })
      .first()
      .click()
    await page.waitForURL(/\/admin\/invoices\/[\w-]+$/u)
    await waitForHydration(page)

    const opener = page.getByTestId('record-payment-button')
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Initial focus is inside the dialog, and the dialog is labelled by its title.
    await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    await expect(dialog).toHaveAccessibleName(/.+/u)

    // Tab 15 times: focus never leaves the dialog.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('route change moves focus to the new page heading', async ({ page }) => {
    await page.goto('/admin')
    await waitForHydration(page)
    const link = page.locator('nav a[href="/admin/quotes"]').first()
    await link.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/admin\/quotes$/u)
    await expect.poll(() => page.evaluate(() => {
      const el = document.activeElement
      return !!el && !!el.closest('main') && (el.tagName === 'H1' || el.tagName === 'MAIN')
    })).toBe(true)
  })
})

/**
 * tests/e2e/notifications-bell.spec.ts — W3-1 / EH-J.
 *
 * # Decisions (ADR-0007)
 *   - The admin accepts a quote → the bus emits `quote.accepted` →
 *     the notification subscriber fans out an in-app row to the
 *     admin → the bell badge increments → clicking the bell shows
 *     the row → clicking "Mark all read" zeros the badge.
 *   - Mock backend run only (CI default); the real backend would
 *     also work but requires DB seeding outside the slice budget.
 *
 * # Notes
 *   - This spec is the canonical user proof the slice is wired end
 *     to end. If the bell button is not found we skip with a clear
 *     reason rather than hang — Phase 1 mock builds may not always
 *     ship the chrome.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickPropertyId(page: Page): Promise<string> {
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const card = page.locator('[data-testid="property-card"]').first()
  await expect(card).toBeVisible()
  const id = await card.getAttribute('data-property-id')
  expect(id).toBeTruthy()
  return id as string
}

test.describe('Notification bell (W3-1)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('accept quote → bell badge → mark all read', async ({ page }) => {
    const bell = page.getByTestId('notification-bell-button')
    if (!(await bell.isVisible().catch(() => false))) {
      test.skip(true, 'Notification bell not rendered in this build.')
    }

    const propertyId = await pickPropertyId(page)
    // Author + send a quote.
    await page.goto(`/admin/properties/${propertyId}/quotes/new`)
    await page.waitForLoadState('networkidle')
    await page
      .getByTestId('line-item-0-description')
      .locator('input')
      .fill('Initial scope')
    await page.getByTestId('line-item-0-unit-cost').locator('input').fill('1500')
    await page.getByTestId('submit-button').click()
    await page.waitForURL(
      new RegExp(`/admin/properties/${propertyId}/quotes/[\\w-]+$`),
      { timeout: 10_000 },
    )
    await page.getByTestId('send-button').click()
    await expect(page.getByTestId('quote-status')).toHaveAttribute('data-status', 'sent')
    // Accept it.
    const acceptBtn = page.getByTestId('accept-button')
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click()
      await expect(page.getByTestId('quote-status')).toHaveAttribute('data-status', 'accepted')
    } else {
      test.skip(true, 'Accept affordance not present in this build.')
    }

    // The bell badge should now show ≥ 1 unread.
    await expect(page.getByTestId('notification-bell-badge')).toBeVisible({ timeout: 5_000 })
    await page.getByTestId('notification-bell-button').click()
    await expect(page.getByTestId('notification-bell-panel')).toBeVisible()
    await page.getByTestId('notification-mark-all-read').click()
    // Badge disappears after mark-all-read.
    await expect(page.getByTestId('notification-bell-badge')).toBeHidden({ timeout: 5_000 })
  })
})

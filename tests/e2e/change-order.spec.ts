/**
 * tests/e2e/change-order.spec.ts — W2-3b / EH-G.
 *
 * # Decisions (ADR-0007)
 *   - Walks the propose → approve loop on a work order. Opens the
 *     Propose modal, fills title/description/amount, submits, then
 *     approves the row inline. Asserts the change-order row's
 *     `data-status` flips to `approved`.
 *   - Mock backend only. Reject path is owned by the unit suite.
 *
 * # Decision cast down
 *   - Rejected: a separate spec for "reject change order". The button
 *     wiring mirrors approve; one verified path is enough for the e2e
 *     surface.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function openFirstWorkOrder(page: Page): Promise<void> {
  await page.goto('/admin/work-orders')
  await page.waitForLoadState('networkidle')
  const row = page.getByTestId('work-order-row').first()
  await expect(row).toBeVisible()
  await row.click()
  await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/, { timeout: 10_000 })
}

test.describe('Change orders (W2-3b)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('propose then approve flips the row to approved', async ({ page }) => {
    await openFirstWorkOrder(page)

    await page.getByTestId('propose-co-button').click()
    await expect(page.getByTestId('propose-co-modal')).toBeVisible()
    await page
      .getByTestId('co-title-input')
      .locator('input')
      .fill('Additional flashing around chimney')
    await page
      .getByTestId('co-description-input')
      .locator('textarea')
      .fill('Discovered rotted flashing on tear-off — replace before re-deck.')
    await page.getByTestId('co-amount-input').locator('input').fill('250')
    await page.getByTestId('co-submit-button').click()

    const row = page.getByTestId('change-order-row').first()
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-status', 'proposed')
    await row.getByTestId('approve-co-button').click()
    await expect(row).toHaveAttribute('data-status', 'approved')
  })
})

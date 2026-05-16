/**
 * tests/e2e/settings-trades.spec.ts — Wave 1B / EH-H / W1-3 admin UI.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut } from './_helpers'
import { reseedRealBackend } from './_reseed'

test.describe('Settings → Trades (Wave 1B / EH-H / W1-3)', () => {
  test.beforeAll(async () => {
    await reseedRealBackend()
  })

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('admin sees the 6 builtin trades after seed', async ({ page }) => {
    await page.goto('/settings/trades')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-trades')).toBeVisible()
    for (const slug of [
      'roofing',
      'siding',
      'gutters',
      'eaves_vents',
      'defensible_space',
      'general_labor',
    ]) {
      await expect(
        page.getByTestId('trade-row').filter({ has: page.locator(`[data-trade-slug="${slug}"]`) }),
      ).toHaveCount(1)
    }
    // Builtins reject delete: no delete button on roofing.
    await expect(page.getByTestId('trade-delete-roofing')).toHaveCount(0)
  })

  test('admin creates a custom trade and it appears in the list', async ({ page }) => {
    await page.goto('/settings/trades')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('trades-new-button').click()
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    await modal.getByTestId('trade-form-name').locator('input').fill('Framing')
    await modal.getByTestId('trade-form-name').locator('input').blur()
    await modal.getByTestId('trade-form-slug').locator('input').fill('framing')
    await modal.getByTestId('trade-form-save').click()

    const row = page.getByTestId('trade-row').filter({ hasText: 'Framing' })
    await expect(row).toHaveCount(1)
    await expect(row.getByText('Custom')).toBeVisible()
    await expect(page.getByTestId('trade-delete-framing')).toBeVisible()
  })

  test('field role cannot reach /settings/trades', async ({ page, context }) => {
    await signOut(context)
    await signInAsField(page)
    await page.goto('/settings/trades')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/403/)
  })
})

/**
 * tests/e2e/settings-numbering.spec.ts — Wave 1B / EH-H / W1-3 admin UI.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut, waitForHydration } from './_helpers'
import { reseedRealBackend } from './_reseed'

test.describe('Settings → Numbering & defaults (Wave 1B / EH-H / W1-3)', () => {
  test.beforeAll(async () => {
    await reseedRealBackend()
  })

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('admin loads defaults and edits the quote number format', async ({ page }) => {
    await page.goto('/settings/numbering-defaults')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-numbering')).toBeVisible()

    const quoteFormat = page.getByTestId('numbering-quote-format').locator('input')
    await expect(quoteFormat).toHaveValue(/Q-\{year\}-\{seq:04\}/)
    await quoteFormat.fill('QUOTE-{year}-{seq:05}')
    await page.getByTestId('numbering-save').click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    // Real persistence survives reload. The browser mock is intentionally
    // in-memory, so re-read it through client-side navigation instead.
    if (process.env.BULWARK_BACKEND === 'mock') {
      await page.locator('a[href="/admin/properties"]').first().click()
      await waitForHydration(page)
      await page.locator('a[href="/settings"]').first().click()
      await page.locator('a[href="/settings/numbering-defaults"]').first().click()
    } else {
      await page.reload()
    }
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('numbering-quote-format').locator('input'))
      .toHaveValue('QUOTE-{year}-{seq:05}')
  })

  test('field role cannot reach /settings/numbering-defaults', async ({ page, context }) => {
    await signOut(context)
    await signInAsField(page)
    await page.goto('/settings/numbering-defaults')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/403/)
  })
})

/**
 * tests/e2e/compliance-list.spec.ts — /admin/compliance list (WP-L06 S4).
 *
 * The list resolves each document's property address with batched
 * property.getMany reads (chunked under its 500-id cap) instead of one request
 * per row. Seeded documents show a real address; the status filter narrows the
 * list through the URL; a field user cannot open the page.
 */
import { expect, test } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut, waitForHydration } from './_helpers'

test.describe('compliance list (WP-L06)', () => {
  test.skip(process.env.BULWARK_BACKEND !== 'real', 'reads seeded compliance documents from Postgres')

  test('rows show the property address from the batched read; the status filter narrows via the URL', async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto('/admin/compliance')
    await waitForHydration(page)
    const rows = page.getByTestId('compliance-row')
    await expect(rows.first()).toBeVisible()
    const total = await rows.count()
    // Every row resolved an address ("line1, city, ST"); an empty cell means the batch missed it.
    for (const address of await page.getByTestId('compliance-row-address').allTextContents()) {
      expect(address.trim()).toMatch(/^.+, .+, [A-Z]{2}$/u)
    }

    const status = (await page.getByTestId('compliance-row-status').first().getAttribute('data-status'))
      ?? (await page.getByTestId('compliance-row-status').first().textContent())!.trim().toLowerCase()
    await page.goto(`/admin/compliance?status=${encodeURIComponent(status)}`)
    await waitForHydration(page)
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeLessThanOrEqual(total)

    await page.goto('/admin/compliance?status=__none__')
    await waitForHydration(page)
    // Unknown filter values fall back to "all", never an error page.
    await expect(rows.first()).toBeVisible()
  })

  test('a field user cannot open the compliance list', async ({ page }) => {
    await signOut(page.context())
    await signInAsField(page)
    await page.goto('/admin/compliance')
    await expect(page.getByTestId('compliance-list')).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/admin\/compliance$/u)
  })
})

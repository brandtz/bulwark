/**
 * tests/e2e/quote-builder.spec.ts — E5-S1.
 *
 * # Decisions (ADR-0007)
 *   - Three tests. (1) Form renders with one initial line item and zero
 *     totals. (2) Adding a line item with qty/unit-cost recomputes the
 *     totals (subtotal, markup, total) live. (3) Save draft persists a
 *     quote and routes to the preview page (preview itself is E5-S3 \u2014
 *     for now we only assert the URL changes).
 *   - We don't test markup-then-tax math here \u2014 the unit suite owns
 *     that. The e2e spec verifies the wire from input \u2192 helper \u2192 DOM.
 *
 * # Decision cast down
 *   - Rejected: a "fills 10 line items" stress test. Adds time without
 *     coverage; the math is already locked by unit tests.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickPropertyId(page: Page): Promise<string> {
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const cards = page.locator('[data-testid="property-card"]')
  await expect(cards.first()).toBeVisible()
  const id = await cards.first().getAttribute('data-property-id')
  expect(id).toBeTruthy()
  return id as string
}

test.describe('Quote builder (E5-S1)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('renders with one blank line item and zero totals', async ({ page }) => {
    const id = await pickPropertyId(page)
    await page.goto(`/admin/properties/${id}/quotes/new`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('quote-builder')).toBeVisible()
    await expect(page.locator('[data-testid="line-item"]')).toHaveCount(1)
    await expect(page.getByTestId('totals-subtotal')).toHaveText('$0.00')
    await expect(page.getByTestId('totals-total')).toHaveText('$0.00')
  })

  test('totals update live as line items are filled', async ({ page }) => {
    const id = await pickPropertyId(page)
    await page.goto(`/admin/properties/${id}/quotes/new`)
    await page.waitForLoadState('networkidle')

    await page
      .getByTestId('line-item-0-description')
      .locator('input')
      .fill('Replace asphalt roof with metal')
    // qty already defaults to 1
    await page.getByTestId('line-item-0-unit-cost').locator('input').fill('1500')

    // Default markup is 10, default tax 0 \u2192 subtotal 1500, markup 150,
    // total 1650.
    await expect(page.getByTestId('totals-subtotal')).toHaveText('$1,500.00')
    await expect(page.getByTestId('totals-markup')).toHaveText('$150.00')
    await expect(page.getByTestId('totals-total')).toHaveText('$1,650.00')
  })

  test('Save draft persists and routes to the preview URL', async ({ page }) => {
    const id = await pickPropertyId(page)
    await page.goto(`/admin/properties/${id}/quotes/new`)
    await page.waitForLoadState('networkidle')

    await page
      .getByTestId('line-item-0-description')
      .locator('input')
      .fill('Defensible-space clearing')
    await page.getByTestId('line-item-0-unit-cost').locator('input').fill('800')

    await page.getByTestId('submit-button').click()
    await page.waitForURL(
      new RegExp(`/admin/properties/${id}/quotes/[\\w-]+$`),
      { timeout: 10000 },
    )
  })
})

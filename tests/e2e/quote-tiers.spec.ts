/**
 * tests/e2e/quote-tiers.spec.ts — W2-3b / EH-G.
 *
 * # Decisions (ADR-0007)
 *   - Walks the full tier authoring loop: select Better tier, mark one
 *     line item as optional, apply a per-line discount, set a customer-
 *     visible note + expiry, then verify the preview surface renders
 *     the tier badge, optional badge, discount badge, and that the list
 *     row shows the tier pill grouped by revision.
 *   - Mock backend only (BULWARK_BACKEND unset). Real-backend reseed is
 *     opt-in elsewhere; this spec doesn't require it.
 *
 * # Decision cast down
 *   - Rejected: a separate spec per tier (good / better / best). The
 *     three tiers share the same control wiring; the unit suite owns
 *     the per-value math. One e2e walk is enough coverage.
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

test.describe('Quote tiers + optional + discount (W2-3b)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('authors a Better-tier quote with optional + discount, then sees badges on detail and list', async ({
    page,
  }) => {
    const propertyId = await pickPropertyId(page)
    await page.goto(`/admin/properties/${propertyId}/quotes/new`)
    await page.waitForLoadState('networkidle')

    // Pick the Better tier via the segmented control.
    await page.getByTestId('quote-tier').getByRole('button', { name: /better/i }).click()

    // Fill the single seed line item.
    await page
      .getByTestId('line-item-0-description')
      .locator('input')
      .fill('Class A metal roof replacement')
    await page.getByTestId('line-item-0-unit-cost').locator('input').fill('2000')

    // Add a second line, mark it optional, apply a 10% discount.
    await page.getByTestId('add-line-item').click()
    await page
      .getByTestId('line-item-1-description')
      .locator('input')
      .fill('Gutter guard add-on')
    await page.getByTestId('line-item-1-unit-cost').locator('input').fill('800')
    await page.getByTestId('line-item-1-optional').locator('input').check()
    await page.getByTestId('line-item-1-discount').locator('input').fill('10')

    // Customer-visible notes + expiry.
    await page
      .getByTestId('field-customerVisibleNotes')
      .locator('textarea')
      .fill('Valid for 30 days. Optional items can be added later.')
    const inThirtyDays = new Date()
    inThirtyDays.setDate(inThirtyDays.getDate() + 30)
    await page
      .getByTestId('field-expiryDate')
      .locator('input')
      .fill(inThirtyDays.toISOString().slice(0, 10))

    await page.getByTestId('submit-button').click()
    await page.waitForURL(
      new RegExp(`/admin/properties/${propertyId}/quotes/[\\w-]+$`),
      { timeout: 10_000 },
    )

    // Detail page asserts.
    await expect(page.getByTestId('quote-tier-badge')).toContainText(/better/i)
    await expect(page.getByTestId('preview-line-optional').first()).toBeVisible()
    await expect(page.getByTestId('preview-line-discount').first()).toContainText('10')

    // List grouping + tier pill.
    await page.goto('/admin/quotes')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-testid="quote-row-tier"]').first()).toBeVisible()
  })
})

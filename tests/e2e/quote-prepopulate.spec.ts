/**
 * tests/e2e/quote-prepopulate.spec.ts — E5-S2.
 *
 * # Decisions (ADR-0007)
 *   - Two tests. (1) The summary page shows the deep-link CTA when the
 *     latest assessment is non-compliant, and arriving on the builder
 *     via that CTA auto-fills one labor line per required upgrade.
 *     (2) The builder also exposes an explicit "Start from assessment"
 *     button when the user lands on `/quotes/new` directly.
 *   - Honors the mock-state navigation rule: the assessment we
 *     pre-populate from is created via the form (client mutation),
 *     then we navigate to the builder via NuxtLink (also client) so
 *     the singleton mock survives.
 *
 * # Decision cast down
 *   - Rejected: parameterising the upgrade math here. The unit suite +
 *     the assessment-summary spec already prove the evaluator. This spec
 *     just verifies the builder consumes its output.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickFreshPropertyId(page: Page): Promise<string> {
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const cards = page.locator('[data-testid="property-card"]')
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  const id = await cards.nth(count - 1).getAttribute('data-property-id')
  expect(id).toBeTruthy()
  return id as string
}

async function fillNonCompliantAssessment(page: Page, propertyId: string) {
  await page.goto(`/admin/properties/${propertyId}/assessment`)
  await page.waitForLoadState('networkidle')
  await page.getByTestId('field-roofMaterial').locator('select').selectOption('wood_shake')
  await page.getByTestId('field-sidingMaterial').locator('select').selectOption('vinyl')
  await page.getByTestId('field-eaveType').locator('select').selectOption('enclosed')
  await page.getByTestId('field-ventType').locator('select').selectOption('ember_resistant')
  await page.getByTestId('defensible-space-toggle').click()
  await page.getByTestId('submit-button').click()
  await page.waitForURL(/\/assessment-summary$/, { timeout: 10000 })
}

test.describe('Quote pre-populate from assessment (E5-S2)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('summary deep-link auto-populates the builder from non-compliant upgrades', async ({ page }) => {
    const id = await pickFreshPropertyId(page)
    await fillNonCompliantAssessment(page, id)

    // Click the CTA on the summary page → builder with `?from=assessment`.
    await page.getByTestId('build-quote-from-assessment').click()
    await page.waitForURL(
      new RegExp(`/admin/properties/${id}/quotes/new\\?from=assessment$`),
    )

    // Two upgrades flagged (wood_shake roof + vinyl siding) → two line items.
    await expect(page.locator('[data-testid="line-item"]')).toHaveCount(2)
    // Banner is hidden once populated.
    await expect(page.getByTestId('prepopulate-banner')).toHaveCount(0)
    // Both descriptions reference the upgraded field.
    await expect(page.getByTestId('line-item-0-description').locator('input'))
      .toHaveValue(/Roof material|Siding material/)
    await expect(page.getByTestId('line-item-1-description').locator('input'))
      .toHaveValue(/Roof material|Siding material/)
  })

  test('builder shows manual "Start from assessment" button when assessment exists', async ({ page }) => {
    const id = await pickFreshPropertyId(page)
    await fillNonCompliantAssessment(page, id)

    // Navigate to the property detail via the breadcrumb (client-side)
    // then jump to /quotes/new from the Quotes tab CTA. We avoid
    // `page.goto` so the mock service singleton survives.
    await page.getByTestId('assessment-summary').getByRole('link', { name: /,/ }).first().click()
    await page.waitForURL(/\/admin\/properties\/[\w-]+(?:\?.*)?$/)
    await page.getByRole('tab', { name: 'Quotes' }).click()
    await page.getByTestId('tab-new-quote-cta').click()
    await page.waitForURL(new RegExp(`/admin/properties/${id}/quotes/new$`))

    const banner = page.getByTestId('prepopulate-banner')
    await expect(banner).toBeVisible()
    // Only one blank line so far.
    await expect(page.locator('[data-testid="line-item"]')).toHaveCount(1)

    await page.getByTestId('prepopulate-button').click()
    await expect(page.locator('[data-testid="line-item"]')).toHaveCount(2)
    await expect(banner).toHaveCount(0)
  })
})

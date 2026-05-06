/**
 * tests/e2e/property-assessment-tab.spec.ts — E4-S4.
 *
 * # Decisions (ADR-0007)
 *   - Two tests. First proves the empty-state CTA renders for a
 *     property with no assessment. Second proves the tab populates
 *     with a compliance banner after a successful submit \u2014 navigation
 *     stays client-side (NuxtLink) so the mock service singleton is
 *     preserved (see Mock-state navigation rule in session memory).
 *
 * # Decision cast down
 *   - Rejected: re-asserting the upgrades table here. That's the
 *     summary page's job; the tab is a preview. Keeping concerns
 *     separated keeps the spec narrow.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickFreshPropertyId(page: Page): Promise<string> {
  // Mirror assessment-summary.spec's known-good picker: list view, last
  // card. Form-creating specs target the FIRST kanban card so trailing
  // list entries stay assessment-free across run order.
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const cards = page.locator('[data-testid="property-card"]')
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  const id = await cards.nth(count - 1).getAttribute('data-property-id')
  expect(id).toBeTruthy()
  return id as string
}

test.describe('Property assessment tab (E4-S4)', () => {
  test.beforeAll(async () => {
    // Real-backend mode: upstream specs leave assessments on otherwise-empty
    // properties, breaking the "no assessment exists" branch.
    const { reseedRealBackend } = await import('./_reseed')
    reseedRealBackend()
  })

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('renders Start assessment CTA when no assessment exists', async ({ page }) => {
    // Navigate via NuxtLink click (client-side) so we don't depend on the
    // mock service being seeded on the SSR side of the detail route.
    await page.goto('/admin/properties?view=list')
    await page.waitForLoadState('networkidle')
    const cards = page.locator('[data-testid="property-card"]')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    await cards.nth(count - 1).click()
    await page.waitForURL(/\/admin\/properties\/[\w-]+$/)
    await page.getByRole('tab', { name: 'Assessment' }).click()
    await expect(page.getByTestId('tab-panel-assessment')).toBeVisible()
    await expect(page.getByTestId('tab-start-assessment-cta')).toBeVisible()
  })

  test('shows compliance banner after a submission and links to summary', async ({ page }) => {
    const id = await pickFreshPropertyId(page)

    // Fill + submit the assessment. Form redirects client-side to the
    // summary page; we then click back into the property detail via the
    // breadcrumb so navigation stays inside the same client mock instance.
    await page.goto(`/admin/properties/${id}/assessment`)
    await page.waitForLoadState('networkidle')
    await page.getByTestId('field-roofMaterial').locator('select').selectOption('metal')
    await page.getByTestId('field-sidingMaterial').locator('select').selectOption('fiber_cement')
    await page.getByTestId('field-eaveType').locator('select').selectOption('enclosed')
    await page.getByTestId('field-ventType').locator('select').selectOption('ember_resistant')
    await page.getByTestId('defensible-space-toggle').click()
    await page.getByTestId('submit-button').click()
    await page.waitForURL(/\/assessment-summary$/, { timeout: 10000 })

    // Click the property breadcrumb (scoped to summary view) to return to
    // detail without a full reload — preserves client mock state.
    await page.getByTestId('assessment-summary').getByRole('link', { name: /,/ }).first().click()
    await page.waitForURL(new RegExp(`/admin/properties/${id}(?:\\?.*)?$`))

    // Click the Assessment tab.
    await page.getByRole('tab', { name: 'Assessment' }).click()

    const banner = page.getByTestId('assessment-tab-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('data-compliant', 'true')
    await expect(page.getByTestId('tab-view-summary-link')).toBeVisible()
  })
})

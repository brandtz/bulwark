/**
 * tests/e2e/assessment-summary.spec.ts — E4-S3.
 *
 * # Decisions (ADR-0007)
 *   - Three tests: empty state for properties without an assessment, the
 *     compliant banner after a green submit, the non-compliant banner +
 *     upgrades table after a wood-shake submit. We DO NOT replicate the
 *     evaluator's per-field combinations here \u2014 the unit suite owns
 *     that. The Playwright job is to prove the UI surfaces the result
 *     deterministically.
 *
 * # Decision cast down
 *   - Rejected: stubbing the assessment service for these tests. The
 *     mock is the real wire format; using it end-to-end catches drift
 *     between the form, the mock, and the summary in one shot.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickFirstPropertyId(page: Page): Promise<string> {
  await page.goto('/admin/properties')
  await page.waitForLoadState('networkidle')
  const id = await page.locator('[data-testid="property-card"]').first().getAttribute('data-property-id')
  expect(id, 'expected at least one property in the fixture pipeline').toBeTruthy()
  return id as string
}

async function fillAssessment(
  page: Page,
  propertyId: string,
  values: { roof: string; siding: string; eave: string; vent: string; defensible: boolean },
) {
  await page.goto(`/admin/properties/${propertyId}/assessment`)
  await page.waitForLoadState('networkidle')
  await page.getByTestId('field-roofMaterial').locator('select').selectOption(values.roof)
  await page.getByTestId('field-sidingMaterial').locator('select').selectOption(values.siding)
  await page.getByTestId('field-eaveType').locator('select').selectOption(values.eave)
  await page.getByTestId('field-ventType').locator('select').selectOption(values.vent)
  if (values.defensible) {
    await page.getByTestId('defensible-space-toggle').click()
  }
  await page.getByTestId('submit-button').click()
  // Form lands directly on the summary page (client-side router.push so the
  // mock service singleton is preserved across navigation).
  await page.waitForURL(/\/assessment-summary$/, { timeout: 10000 })
}

test.describe('Assessment summary (E4-S3)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('empty state offers a Start assessment CTA', async ({ page }) => {
    // Pick a property we have NOT submitted an assessment for. The mock's
    // store starts empty so the very first property in the pipeline qualifies
    // as long as the test runs before any assessment-creating spec touches
    // this exact id. To stay robust across run order we navigate to a
    // property guaranteed to be untouched by the form-spec: the LAST card
    // in the pipeline list view.
    await page.goto('/admin/properties?view=list')
    await page.waitForLoadState('networkidle')
    const cards = page.locator('[data-testid="property-card"]')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    const propertyId = await cards.nth(count - 1).getAttribute('data-property-id')
    expect(propertyId).toBeTruthy()

    await page.goto(`/admin/properties/${propertyId}/assessment-summary`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('summary-empty')).toBeVisible()
    await expect(page.getByTestId('start-assessment-cta')).toBeVisible()
  })

  test('compliant submission shows green banner without upgrades', async ({ page }) => {
    const id = await pickFirstPropertyId(page)
    await fillAssessment(page, id, {
      roof: 'metal',
      siding: 'fiber_cement',
      eave: 'enclosed',
      vent: 'ember_resistant',
      defensible: true,
    })
    await page.waitForLoadState('networkidle')

    const banner = page.getByTestId('summary-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('data-compliant', 'true')
    await expect(page.getByTestId('summary-upgrades')).toHaveCount(0)
  })

  test('non-compliant roof flags one upgrade with the right standard ref', async ({ page }) => {
    const id = await pickFirstPropertyId(page)
    await fillAssessment(page, id, {
      roof: 'wood_shake',
      siding: 'fiber_cement',
      eave: 'enclosed',
      vent: 'ember_resistant',
      defensible: true,
    })
    await page.waitForLoadState('networkidle')

    const banner = page.getByTestId('summary-banner')
    await expect(banner).toHaveAttribute('data-compliant', 'false')
    const upgrades = page.getByTestId('summary-upgrades')
    await expect(upgrades).toBeVisible()
    await expect(page.getByTestId('upgrade-roofMaterial')).toBeVisible()
    await expect(upgrades).toContainText('OAR 629-044-1030')
  })
})

/**
 * tests/e2e/property-assessment-form.spec.ts — E4-S2.
 *
 * # Decisions (ADR-0007)
 *   - Story scope: prove the form renders, requires every material
 *     selection, and successfully submits to the mock service. We do
 *     NOT exercise the compliance summary here \u2014 that's E4-S3, with
 *     its own spec. Keeping per-story specs narrow keeps fail localisation
 *     fast.
 *   - Cold-start fix: every test waits for `networkidle` after `goto()`
 *     before clicking. See bulwark-progress memory for the pattern.
 *
 * # Decision cast down
 *   - Rejected: signing in as the field persona to "be more authentic."
 *     The form's middleware accepts both admin and field; using admin
 *     keeps the helper surface small. Persona-specific access is already
 *     covered by `persona-matrix.spec.ts`.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('Property assessment form (E4-S2)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('renders the form for an existing property', async ({ page }) => {
    // Navigate via the pipeline to grab a real property id deterministically.
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    const firstCard = page.locator('[data-testid="property-card"]').first()
    await expect(firstCard).toBeVisible()
    const propertyId = await firstCard.getAttribute('data-property-id')
    expect(propertyId).toBeTruthy()

    await page.goto(`/admin/properties/${propertyId}/assessment`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('assessment-form')).toBeVisible()
    for (const field of [
      'field-roofMaterial',
      'field-sidingMaterial',
      'field-eaveType',
      'field-ventType',
      'field-defensibleSpaceCleared',
      'field-notes',
      'submit-button',
    ]) {
      await expect(page.getByTestId(field)).toBeVisible()
    }
  })

  test('blocks submit when materials are not selected', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    const propertyId = await page.locator('[data-testid="property-card"]').first().getAttribute('data-property-id')
    await page.goto(`/admin/properties/${propertyId}/assessment`)
    await page.waitForLoadState('networkidle')
    await page.getByTestId('submit-button').click()
    // We don't navigate; URL stays on /assessment.
    await expect(page).toHaveURL(/\/assessment$/)
    // At least one error string is rendered.
    await expect(page.getByText(/Select a roof material/i)).toBeVisible()
  })

  test('saves a complete assessment and routes back to detail', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    const propertyId = await page.locator('[data-testid="property-card"]').first().getAttribute('data-property-id')
    await page.goto(`/admin/properties/${propertyId}/assessment`)
    await page.waitForLoadState('networkidle')

    await page.getByTestId('field-roofMaterial').locator('select').selectOption('metal')
    await page.getByTestId('field-sidingMaterial').locator('select').selectOption('fiber_cement')
    await page.getByTestId('field-eaveType').locator('select').selectOption('enclosed')
    await page.getByTestId('field-ventType').locator('select').selectOption('ember_resistant')
    // Toggle defensible space on.
    await page.getByTestId('defensible-space-toggle').click()
    await page.getByTestId('field-notes').locator('textarea').fill('Looks good. Cleared brush 50ft.')

    await page.getByTestId('submit-button').click()
    await expect(page).toHaveURL(/\/admin\/properties\/[\w-]+\/assessment-summary$/, { timeout: 10000 })
  })
})

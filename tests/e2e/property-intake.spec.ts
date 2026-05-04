/**
 * tests/e2e/property-intake.spec.ts — property intake form (E3-S4).
 *
 * # Decisions (ADR-0007)
 *   - Covers: form renders, required-field validation surfaces inline
 *     errors, a complete submission lands on the pipeline page with the
 *     new card visible in the `lead` column (the schema sets status='lead').
 *   - Mode: serial because tests share a cookie context and the third
 *     test mutates fixture state (creates a property) — running in
 *     parallel could cause flaky duplicate-row counts.
 *   - We assert the new card by its rendered street address, not by a
 *     stable id, since `crypto.randomUUID()` makes the id unpredictable.
 *
 * # Decision cast down
 *   - Rejected: stubbing the property service. The whole point of the
 *     mock layer is end-to-end fidelity — let the actual contract fire.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Property intake (E3-S4)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow for now')
    await signInAsAdmin(page)
  })

  test('intake form renders with required fields', async ({ page }) => {
    await page.goto('/admin/properties/new')
    await expect(page.getByTestId('property-intake-form')).toBeVisible()
    await expect(page.getByTestId('field-addressLine1')).toBeVisible()
    await expect(page.getByTestId('field-city')).toBeVisible()
    await expect(page.getByTestId('field-state')).toBeVisible()
    await expect(page.getByTestId('field-postalCode')).toBeVisible()
    await expect(page.getByTestId('submit-button')).toBeVisible()
  })

  test('submitting empty form surfaces validation errors', async ({ page }) => {
    await page.goto('/admin/properties/new')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('submit-button').click()
    // At minimum we expect inline errors on the four required fields.
    const form = page.getByTestId('property-intake-form')
    const alerts = form.getByRole('alert')
    await expect(alerts.first()).toBeVisible()
    expect(await alerts.count()).toBeGreaterThanOrEqual(4)
    // Still on the intake page.
    await expect(page).toHaveURL(/\/admin\/properties\/new$/)
  })

  test('valid submission creates a property and lands on the pipeline', async ({ page }) => {
    const street = `999 Bulwark Spec Way ${Date.now()}`
    await page.goto('/admin/properties/new')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('field-addressLine1').locator('input').fill(street)
    await page.getByTestId('field-city').locator('input').fill('Oakland')
    await page.getByTestId('field-state').locator('input').fill('CA')
    await page.getByTestId('field-postalCode').locator('input').fill('94501')
    await page.getByTestId('submit-button').click()

    await expect(page).toHaveURL(/\/admin\/properties$/, { timeout: 10000 })
    const leadColumn = page.locator('[data-testid="pipeline-column"][data-status="lead"]')
    await expect(leadColumn).toBeVisible()
    await expect(leadColumn.getByText(street)).toBeVisible()
  })
})

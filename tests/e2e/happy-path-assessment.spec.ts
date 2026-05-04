/**
 * tests/e2e/happy-path-assessment.spec.ts — E4 closing happy-path (E4-S5).
 *
 * # Decisions (ADR-0007)
 *   - One long chromium-only test. Threads the assessment domain end
 *     to end: pick a property → open the form via the detail tab CTA →
 *     submit a non-compliant assessment → land on the summary →
 *     verify the banner + the offending field's standard ref → click
 *     back to the detail hub → Assessment tab now previews the same
 *     compliance state. Each piece has its own focused spec; this one
 *     guards the seams between them.
 *   - Navigation stays client-side (NuxtLink + router.push) per the
 *     mock-state navigation rule (E4-S3 lesson): a `page.goto` would
 *     hit a fresh SSR module instance with empty `rows[]`.
 *
 * # Decision cast down
 *   - Rejected: also chaining work-orders / quotes here. Those belong
 *     to E5/E6's own happy-paths. Keeping E4's seatbelt narrow keeps
 *     failure localization sharp.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test('E4 happy path: detail → start assessment → non-compliant → summary → back to tab', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'desktop-only flow for now')
  await signInAsAdmin(page)

  // 1) Pick a property from the list view (last card stays clean across
  //    run order; form-creating specs target the first kanban card).
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const cards = page.locator('[data-testid="property-card"]')
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  await cards.nth(count - 1).click()
  await page.waitForURL(/\/admin\/properties\/[\w-]+$/)

  // 2) Assessment tab shows the empty-state CTA.
  await page.getByRole('tab', { name: 'Assessment' }).click()
  const startCta = page.getByTestId('tab-start-assessment-cta')
  await expect(startCta).toBeVisible()

  // 3) Click "Start assessment" — opens the form (client-side).
  await startCta.click()
  await page.waitForURL(/\/admin\/properties\/[\w-]+\/assessment$/)

  // 4) Fill a NON-compliant assessment (wood_shake roof violates
  //    OAR 629-044-1030).
  await page.getByTestId('field-roofMaterial').locator('select').selectOption('wood_shake')
  await page.getByTestId('field-sidingMaterial').locator('select').selectOption('fiber_cement')
  await page.getByTestId('field-eaveType').locator('select').selectOption('enclosed')
  await page.getByTestId('field-ventType').locator('select').selectOption('ember_resistant')
  await page.getByTestId('defensible-space-toggle').click()
  await page.getByTestId('submit-button').click()

  // 5) Lands on the summary page with the non-compliant banner + the
  //    correct standard ref for the roof flag.
  await page.waitForURL(/\/assessment-summary$/, { timeout: 10000 })
  const banner = page.getByTestId('summary-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute('data-compliant', 'false')
  const roofUpgrade = page.getByTestId('upgrade-roofMaterial')
  await expect(roofUpgrade).toBeVisible()
  await expect(roofUpgrade).toContainText('OAR 629-044-1030')

  // 6) Navigate back to the property detail via the breadcrumb (scoped
  //    to the summary view to dodge the sidebar's "Properties" link).
  await page.getByTestId('assessment-summary').getByRole('link', { name: /,/ }).first().click()
  await page.waitForURL(/\/admin\/properties\/[\w-]+(?:\?.*)?$/)

  // 7) Open the Assessment tab — preview now shows the non-compliant
  //    banner + the link to the full summary.
  await page.getByRole('tab', { name: 'Assessment' }).click()
  const tabBanner = page.getByTestId('assessment-tab-banner')
  await expect(tabBanner).toBeVisible()
  await expect(tabBanner).toHaveAttribute('data-compliant', 'false')
  await expect(page.getByTestId('tab-view-summary-link')).toBeVisible()
})

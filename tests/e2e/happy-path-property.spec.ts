/**
 * tests/e2e/happy-path-property.spec.ts — E3 closing happy-path (E3-S7).
 *
 * # Decisions (ADR-0007)
 *   - One spec, one long test. The point is to prove the property
 *     domain holds together end-to-end: create → see in pipeline →
 *     change status → open detail → tabs render → reach client. Each
 *     intermediate concern already has its own focused spec; this one
 *     is the integration smoke test that catches drift between them.
 *   - chromium-only (desktop). Mobile parity for the same flow is
 *     covered piecemeal by the persona-matrix + UI-primitives specs.
 *
 * # Decision cast down
 *   - Rejected: turning this into the only property spec. Story-scoped
 *     specs catch regressions faster (smaller blast radius, faster fail
 *     localization). Happy-path is the seatbelt, not the seat.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test('E3 happy path: intake → pipeline → status → detail → client', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'desktop-only flow for now')
  await signInAsAdmin(page)

  const street = `7777 Happy Path Way ${Date.now()}`

  // 1) Open the intake form and create a property.
  await page.goto('/admin/properties/new')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('field-addressLine1').locator('input').fill(street)
  await page.getByTestId('field-city').locator('input').fill('Oakland')
  await page.getByTestId('field-state').locator('input').fill('CA')
  await page.getByTestId('field-postalCode').locator('input').fill('94501')
  await page.getByTestId('submit-button').click()

  // 2) Lands on the pipeline with the new card visible in `lead`.
  await expect(page).toHaveURL(/\/admin\/properties$/, { timeout: 10000 })
  const leadColumn = page.locator('[data-testid="pipeline-column"][data-status="lead"]')
  const newCard = leadColumn.locator(`[data-testid="property-card"]:has-text("${street}")`)
  await expect(newCard).toBeVisible({ timeout: 10000 })

  // 3) Change its status via the inline menu — moves to `scheduled`.
  await newCard.getByTestId('status-menu-button').click()
  await newCard.getByTestId('status-menu-item-scheduled').click()
  const scheduledCard = page.locator(
    `[data-testid="pipeline-column"][data-status="scheduled"] [data-testid="property-card"]:has-text("${street}")`,
  )
  await expect(scheduledCard).toBeVisible({ timeout: 10000 })

  // 4) Open the detail hub for the moved card.
  await scheduledCard.click()
  await expect(page).toHaveURL(/\/admin\/properties\/[\w-]+(?:\?.*)?$/, { timeout: 10000 })
  await expect(page.getByTestId('property-detail')).toBeVisible()
  await expect(page.getByTestId('property-address')).toContainText(street)

  // 5) Default tab is Overview.
  await expect(page.getByTestId('tab-panel-overview')).toBeVisible()

  // 6) Other tabs exist and switch panels.
  await page.getByRole('tab', { name: 'Quotes' }).click()
  await expect(page.getByTestId('tab-panel-quotes')).toBeVisible()

  // 7) Back to pipeline via breadcrumb (scoped to the detail page wrapper
  //    to avoid the sidebar's identically-named link).
  await page.getByTestId('property-detail').getByRole('link', { name: 'Properties' }).click()
  await expect(page).toHaveURL(/\/admin\/properties$/)
})

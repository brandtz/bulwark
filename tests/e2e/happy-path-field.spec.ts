/**
 * tests/e2e/happy-path-field.spec.ts — E10-S6 closing path.
 *
 * # Decisions (ADR-0007)
 *   - Single serial test on chromium: sign in as the field
 *     persona, force a 390px iPhone-ish viewport, walk
 *     dashboard → properties → property → start assessment.
 *     Asserts (1) every page resolves with its testid, (2)
 *     no `$` character is rendered anywhere we visit (the
 *     financial-information firewall for field role).
 *
 * # Decision cast down
 *   - Rejected: walking through the WO progress updater. It
 *     lives on /admin/work-orders/[id] which is admin-only by
 *     design (and persona-matrix.spec enforces that). The field
 *     surface stops at the assessment form for v1; a field-side
 *     WO detail lands when the sponsor asks for one.
 */
import { test, expect } from '@playwright/test'
import { signInAsField } from './_helpers'

test.describe('Field GC happy path (E10-S6)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await signInAsField(page)
  })

  test('field user walks dashboard → properties → property → assessment', async ({ page }) => {
    test.slow()

    // 1. Root redirect should land on /field/dashboard for the field role.
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/field\/dashboard/)
    await expect(page.getByTestId('field-dashboard')).toBeVisible()

    // KPI cards render with numbers.
    await expect(page.getByTestId('field-kpi-properties')).toBeVisible()
    await expect(page.getByTestId('field-kpi-work-orders')).toBeVisible()

    // No financial data on the dashboard.
    await expect(page.locator('body')).not.toContainText('$')

    // 2. Tap "My properties" — navigate via the link, not page.goto.
    await page.getByTestId('field-link-properties').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('field-properties')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('$')

    // 3. Tap the first property row.
    const firstRow = page.getByTestId('field-property-row').first()
    await expect(firstRow).toBeVisible()
    await firstRow.click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('field-property-detail')).toBeVisible()
    await expect(page.getByTestId('field-property-address')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('$')

    // 4. Tap "Start assessment" / "Update assessment".
    await page.getByTestId('field-start-assessment').click()
    await page.waitForLoadState('networkidle')

    // Land on the assessment form (already field-allowed via E4).
    await expect(page).toHaveURL(/\/admin\/properties\/[^/]+\/assessment$/)
  })
})

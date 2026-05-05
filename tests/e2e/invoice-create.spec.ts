/**
 * tests/e2e/invoice-create.spec.ts — E8-S3.
 *
 * # Decisions (ADR-0007)
 *   - Two tests: the WO detail page exposes a Create invoice CTA
 *     pointing at the create flow with the workOrderId pre-bound;
 *     submitting the form lands on the new invoice's detail page
 *     with the line items the WO pre-filled.
 *
 * # Decision cast down
 *   - Rejected: asserting the live totals math here. The `money.ts`
 *     unit suite already covers `computeQuoteTotals`; the e2e spec
 *     just needs to know the round-trip works.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('Invoice create from WO (E8-S3)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('CTA on WO detail routes to the invoice create page', async ({ page }) => {
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('work-order-row').first().click()
    await expect(page.getByTestId('work-order-detail')).toBeVisible()

    const cta = page.getByTestId('create-invoice-cta')
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page).toHaveURL(/\/invoices\/new\?workOrderId=/)
    await expect(page.getByTestId('invoice-new-form')).toBeVisible()
    // Pre-filled at least one line item from the WO.
    await expect(page.getByTestId('invoice-new-line').first()).toBeVisible()
  })

  test('submitting the form creates the invoice and lands on its detail page', async ({
    page,
  }) => {
    // Direct nav to a known WO via the list page first.
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('work-order-row').first().click()
    await page.getByTestId('create-invoice-cta').click()
    await expect(page.getByTestId('invoice-new-form')).toBeVisible()

    // Fill at least one labor line cost so the total > 0.
    const firstUnit = page.getByTestId('invoice-new-line').first().getByLabel('Unit ($)')
    await firstUnit.fill('1500.00')

    await page.getByTestId('invoice-new-submit').click()
    await expect(page).toHaveURL(/\/admin\/invoices\/[^/]+$/, { timeout: 10000 })
    await expect(page.getByTestId('invoice-detail')).toBeVisible()
    await expect(page.getByTestId('invoice-status')).toHaveAttribute(
      'data-status',
      'draft',
    )
  })
})

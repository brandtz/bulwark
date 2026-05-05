/**
 * tests/e2e/happy-path-invoice.spec.ts — Epic E8 closer (E8-S4).
 *
 * # Decisions (ADR-0007)
 *   - One serial test that walks the sponsor's full invoice journey
 *     end-to-end: open a work order → click Create invoice → land on
 *     the create flow with WO-derived line items pre-filled → set a
 *     unit cost → submit → land on the invoice detail page (status
 *     draft) → click Send invoice (status flips to sent) → click
 *     Mark paid (status flips to paid) → navigate to the invoices
 *     list with the `paid` filter and assert the new invoice number
 *     is present.
 *   - All navigation is client-side (no fresh `page.goto` between
 *     mutations) per the mock-state nav rule. The list page is the
 *     one exception — the seed invoices are persisted in the same
 *     mock module instance, so a `page.goto('/admin/invoices?…')`
 *     after the mutations is safe.
 *
 * # Decision cast down
 *   - Rejected: asserting the totals dollar string. The money unit
 *     suite covers the math; this test just needs the status
 *     machine to land on `paid`.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Happy-path: invoice (E8-S4)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('create from WO → send → mark paid → see in paid filter', async ({
    page,
  }) => {
    // 1. Open a work order from the list.
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('work-order-row').first().click()
    await expect(page.getByTestId('work-order-detail')).toBeVisible()

    // 2. Create invoice flow.
    await page.getByTestId('create-invoice-cta').click()
    await expect(page.getByTestId('invoice-new-form')).toBeVisible()
    const firstUnit = page
      .getByTestId('invoice-new-line')
      .first()
      .getByLabel('Unit ($)')
    await firstUnit.fill('2500.00')
    await page.getByTestId('invoice-new-submit').click()

    // 3. Land on the detail page in draft.
    await expect(page).toHaveURL(/\/admin\/invoices\/[^/]+$/, { timeout: 10000 })
    await expect(page.getByTestId('invoice-detail')).toBeVisible()
    await expect(page.getByTestId('invoice-status')).toHaveAttribute(
      'data-status',
      'draft',
    )
    const invoiceNumber = await page.getByTestId('invoice-number').textContent()
    expect(invoiceNumber).toMatch(/INV-\d{4}-\d{4}/)

    // 4. Send → flips to sent.
    await page.getByTestId('invoice-send-button').click()
    await expect(page.getByTestId('invoice-status')).toHaveAttribute(
      'data-status',
      'sent',
      { timeout: 5000 },
    )

    // 5. Mark paid → flips to paid.
    await page.getByTestId('invoice-mark-paid-button').click()
    await expect(page.getByTestId('invoice-status')).toHaveAttribute(
      'data-status',
      'paid',
      { timeout: 5000 },
    )

    // 6. Navigate to the paid filter via client-side routing
    //    (page.goto would reset the client mock module). Use the
    //    breadcrumbs link back to the list, then click Paid.
    await page.getByTestId('invoice-back-link').click()
    await expect(page).toHaveURL(/\/admin\/invoices(\?|$)/)
    await page
      .getByTestId('invoice-status-filter')
      .getByRole('tab', { name: 'Paid' })
      .click()
    const rows = page.getByTestId('invoice-row')
    await expect(rows.first()).toBeVisible()
    const numbers = await page
      .getByTestId('invoice-row-number')
      .allTextContents()
    expect(numbers.map((s) => s.trim())).toContain((invoiceNumber ?? '').trim())
  })
})

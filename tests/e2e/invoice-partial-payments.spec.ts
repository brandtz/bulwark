/**
 * tests/e2e/invoice-partial-payments.spec.ts — W2-3b / EH-G.
 *
 * # Decisions (ADR-0007)
 *   - Walks the partial-payment ledger: opens an existing invoice,
 *     sends it (markSent) if draft, records a payment less than the
 *     remaining balance (partial), records the balance, and asserts
 *     the status chip transitions draft → sent → partial → paid.
 *   - The seed fixtures expose at least one draft invoice; we pluck
 *     the first row from the list.
 *   - Mock backend only.
 *
 * # Decision cast down
 *   - Rejected: per-method coverage (check / ACH / wire). Method is a
 *     label-only field — the unit suite owns the enumeration.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickInvoice(page: Page): Promise<void> {
  await page.goto('/admin/invoices')
  await page.waitForLoadState('networkidle')
  const row = page.getByTestId('invoice-row').first()
  await expect(row).toBeVisible()
  await row.click()
  await page.waitForURL(/\/admin\/invoices\/[\w-]+$/, { timeout: 10_000 })
}

test.describe('Invoice partial payments (W2-3b)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('records two payments and transitions sent → partial → paid', async ({ page }) => {
    await pickInvoice(page)

    // If draft, send first so the payment surface is enabled.
    const status = page.getByTestId('invoice-status')
    const initial = await status.getAttribute('data-status')
    if (initial === 'draft') {
      await page.getByTestId('invoice-send-button').click()
      await expect(status).toHaveAttribute('data-status', /sent|partial/)
    }

    // Read the remaining balance string ($1,234.56), parse, and split it 40/60.
    const remainingText = (await page.getByTestId('balance-remaining').textContent()) ?? '$0.00'
    const remainingCents = Math.round(
      Number(remainingText.replace(/[^0-9.-]/g, '')) * 100,
    )
    expect(remainingCents).toBeGreaterThan(0)
    const firstPayment = Math.round(remainingCents * 0.4)
    const secondPayment = remainingCents - firstPayment

    // Record the first partial payment.
    await page.getByTestId('record-payment-button').click()
    await expect(page.getByTestId('record-payment-modal')).toBeVisible()
    await page
      .getByTestId('payment-amount-input')
      .locator('input')
      .fill((firstPayment / 100).toFixed(2))
    await page.getByTestId('payment-submit-button').click()
    await expect(status).toHaveAttribute('data-status', 'partial')

    // Record the balance.
    await page.getByTestId('record-payment-button').click()
    await page
      .getByTestId('payment-amount-input')
      .locator('input')
      .fill((secondPayment / 100).toFixed(2))
    await page.getByTestId('payment-submit-button').click()
    await expect(status).toHaveAttribute('data-status', 'paid')
    await expect(page.getByTestId('payment-row')).toHaveCount(2)
  })
})

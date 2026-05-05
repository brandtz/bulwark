/**
 * tests/e2e/invoice-detail.spec.ts — E8-S2.
 *
 * # Decisions (ADR-0007)
 *   - Three tests: draft invoice surfaces Send action and flips to
 *     sent on click; sent invoice surfaces Mark paid and flips to
 *     paid; overdue derived view renders the right pill on a sent
 *     past-due fixture.
 *
 * # Decision cast down
 *   - Rejected: asserting the full date strip strings. The format is
 *     locale-dependent under headed Playwright and adds noise.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function openInvoiceWithStatus(page: Page, status: string) {
  await page.goto(`/admin/invoices?status=${status}`)
  await page.waitForLoadState('networkidle')
  const row = page.getByTestId('invoice-row').first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page).toHaveURL(/\/admin\/invoices\/[^/]+$/)
  await expect(page.getByTestId('invoice-detail')).toBeVisible()
}

test.describe('Invoice detail (E8-S2)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('draft invoice can be sent', async ({ page }) => {
    await openInvoiceWithStatus(page, 'draft')
    await expect(page.getByTestId('invoice-status')).toHaveAttribute(
      'data-status',
      'draft',
    )
    await page.getByTestId('invoice-send-button').click()
    await expect(page.getByTestId('invoice-status')).toHaveAttribute(
      'data-status',
      'sent',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('invoice-mark-paid-button')).toBeVisible()
  })

  test('sent invoice can be marked paid', async ({ page }) => {
    // Filter to "sent" — the fixture set has one non-overdue sent row.
    await openInvoiceWithStatus(page, 'sent')
    await expect(page.getByTestId('invoice-status')).toHaveAttribute(
      'data-status',
      'sent',
    )
    await page.getByTestId('invoice-mark-paid-button').click()
    await expect(page.getByTestId('invoice-status')).toHaveAttribute(
      'data-status',
      'paid',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('invoice-paid-amount')).toBeVisible()
  })

  test('overdue invoice renders the overdue pill', async ({ page }) => {
    await openInvoiceWithStatus(page, 'overdue')
    await expect(page.getByTestId('invoice-status')).toHaveAttribute(
      'data-status',
      'overdue',
    )
    // Overdue is sent + past-due, so the mark-paid action is still available.
    await expect(page.getByTestId('invoice-mark-paid-button')).toBeVisible()
  })
})

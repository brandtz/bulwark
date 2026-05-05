/**
 * tests/e2e/invoices-list.spec.ts — E8-S1.
 *
 * # Decisions (ADR-0007)
 *   - Two tests against the seeded fixtures: row-rendering with the
 *     four seed invoices showing through, and the segmented-status
 *     filter narrowing to the `Overdue` view (derived from sent +
 *     past dueAt). The fixtures intentionally include one row in each
 *     persisted status plus one overdue row so this spec stays
 *     deterministic without mutation.
 *
 * # Decision cast down
 *   - Rejected: asserting exact totals strings. The formatter is
 *     covered by the money unit tests; here we just need to know
 *     rows and statuses render.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('Invoices list (E8-S1)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('renders all seed invoices with status pills', async ({ page }) => {
    await page.goto('/admin/invoices')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('invoices-list')).toBeVisible()

    const rows = page.getByTestId('invoice-row')
    // Four seed rows: draft + sent + overdue + paid.
    await expect(rows).toHaveCount(4)

    // Each persisted status surfaces at least once.
    const statuses = page.getByTestId('invoice-row-status')
    const values = await Promise.all(
      (await statuses.elementHandles()).map((h) => h.getAttribute('data-status')),
    )
    expect(values).toEqual(expect.arrayContaining(['draft', 'sent', 'overdue', 'paid']))
  })

  test('overdue filter narrows to the past-due row', async ({ page }) => {
    await page.goto('/admin/invoices')
    await page.waitForLoadState('networkidle')

    await page
      .getByTestId('invoice-status-filter')
      .getByRole('tab', { name: 'Overdue' })
      .click()
    await expect(page).toHaveURL(/\?(?:.*&)?status=overdue/)

    const rows = page.getByTestId('invoice-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first().getByTestId('invoice-row-status')).toHaveAttribute(
      'data-status',
      'overdue',
    )
  })
})

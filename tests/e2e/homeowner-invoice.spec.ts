/**
 * tests/e2e/homeowner-invoice.spec.ts — W4-2 (deferred from W3-4 /
 * EH-O / ADR-0032).
 *
 * # Status: SKIPPED
 *   - `/homeowner/invoices/[id]` is not yet a page (W3-4 handoff
 *     "Known follow-ups" calls the detail pages out as stubs). The
 *     list page `/homeowner/invoices` ships and renders rows, but the
 *     read-only invoice render + payment-history list this spec is
 *     supposed to cover live on the missing detail page.
 *   - Unskip once the detail page lands with `data-testid` hooks for
 *     the totals block and the payment list.
 *
 * # Planned flow once unskipped
 *   1. Seed the homeowner + linked property + invoice graph.
 *   2. Homeowner logs in, opens `/homeowner/invoices`, clicks the first
 *      row → routes to `/homeowner/invoices/[id]`.
 *   3. Asserts totals block renders (read-only — no edit affordances).
 *   4. Asserts payment-history list renders (even if empty state).
 */
import { test, expect } from '@playwright/test'
import { signIn } from './_helpers'
import { HOMEOWNER_PORTAL_FIXTURE } from '../setup/seed-homeowner-portal'

test.describe('Homeowner invoice detail (W4-2 / EH-O)', () => {
  test('homeowner views invoice read-only with payment history', async ({ page }) => {
    test.skip(
      true,
      'TODO: unskip once /homeowner/invoices/[id] ships (W3-4 follow-up — detail pages were stubs).',
    )

    await signIn(page.context(), HOMEOWNER_PORTAL_FIXTURE.email)
    await page.goto('/homeowner/invoices')
    const firstRow = page.locator('[data-testid^="ho-invoice-"]').first()
    await firstRow.click()
    await expect(page.getByTestId('homeowner-invoice-detail')).toBeVisible()
    await expect(page.getByTestId('homeowner-invoice-totals')).toBeVisible()
    await expect(page.getByTestId('homeowner-invoice-payments')).toBeVisible()
  })
})

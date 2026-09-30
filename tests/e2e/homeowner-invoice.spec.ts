/**
 * tests/e2e/homeowner-invoice.spec.ts — homeowner invoice list → detail
 * (W4-2 / EH-O / ADR-0032; self-scoped reads WP-L07).
 *
 * The detail page existed but was unreachable until 2026-09-29: invoices.vue
 * shadowed invoices/[id].vue (see tests/unit/page-nesting.test.ts), and this
 * spec was skipped as "not shipped", which hid it.
 *
 *   - The homeowner opens /homeowner/invoices, clicks a row and lands on the
 *     read-only detail: number, total, line items, no edit controls.
 *   - An invoice id that is not theirs shows the empty state.
 *   - Payment history and Pay online belong to the client-portal redesign
 *     (WP-F2), not this legacy page.
 */
import { test, expect } from '@playwright/test'
import { signIn, waitForHydration } from './_helpers'
import { seedHomeownerPortal, HOMEOWNER_PORTAL_FIXTURE } from '../setup/seed-homeowner-portal'

test.describe('Homeowner invoice detail (W4-2 / EH-O)', () => {
  test.beforeAll(async () => {
    test.skip(process.env.BULWARK_BACKEND !== 'real', 'real-backend only — needs homeowner_users seed')
    await seedHomeownerPortal()
  })

  test('homeowner opens a read-only invoice from the list', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signIn(page.context(), HOMEOWNER_PORTAL_FIXTURE.email)
    await page.goto('/homeowner/invoices')
    await waitForHydration(page)
    await expect(page.getByTestId('homeowner-invoices')).toBeVisible()
    const firstRow = page.locator('[data-testid^="ho-invoice-"]').filter({ has: page.locator('a') }).first()
    await expect(firstRow).toBeVisible()
    await firstRow.locator('a').click()
    await page.waitForURL(/\/homeowner\/invoices\/[\w-]+$/u)
    await waitForHydration(page)

    const detail = page.getByTestId('homeowner-invoice-detail')
    await expect(detail).toBeVisible()
    await expect(page.getByTestId('ho-invoice-number')).toHaveText(/\S/u)
    await expect(page.getByTestId('ho-invoice-total')).toHaveText(/\$\s?[\d,]+/u)
    await expect(page.getByTestId('ho-invoice-line').first()).toBeVisible()
    // Read-only: no inputs or edit/delete controls for the homeowner.
    await expect(detail.locator('input, textarea, select')).toHaveCount(0)
    await expect(detail.getByRole('button', { name: /edit|delete|void|record payment/iu })).toHaveCount(0)

    await page.goto('/homeowner/invoices/00000000-0000-4000-8000-00000000dead')
    await waitForHydration(page)
    await expect(page.getByTestId('ho-invoice-empty')).toBeVisible()
    await expect(page.getByTestId('ho-invoice-line')).toHaveCount(0)
  })
})

/**
 * tests/e2e/quote-preview.spec.ts — E5-S3.
 *
 * # Decisions (ADR-0007)
 *   - Two tests. (1) After save-draft the preview renders the
 *     persisted quote (number, line item, totals) in `draft` status with
 *     a visible Send button. (2) Clicking Send marks it sent: status
 *     pill flips to `Sent`, button is replaced by the already-sent note,
 *     a success toast surfaces.
 *   - We build the quote in-test via the builder UI rather than seeding
 *     fixtures: fixtures would have to round-trip through the SSR mock
 *     instance which doesn't see client mutations. Building it through
 *     the form keeps the whole flow client-side.

 *
 * # Decision cast down
 *   - Rejected: covering rejected/expired transitions. Those land in
 *     E5-S4 (list + filters) and E5-S5 (closing happy-path).
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickFreshPropertyId(page: Page): Promise<string> {
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const cards = page.locator('[data-testid="property-card"]')
  await expect(cards.first()).toBeVisible()
  const id = await cards.last().getAttribute('data-property-id')
  expect(id).toBeTruthy()
  return id as string
}

async function buildAndSaveDraft(page: Page, id: string): Promise<void> {
  await page.goto(`/admin/properties/${id}/quotes/new`)
  await page.waitForLoadState('networkidle')
  await page
    .getByTestId('line-item-0-description')
    .locator('input')
    .fill('Replace asphalt roof with metal')
  await page.getByTestId('line-item-0-unit-cost').locator('input').fill('1500')
  await page.getByTestId('submit-button').click()
  await page.waitForURL(
    new RegExp(`/admin/properties/${id}/quotes/[\\w-]+$`),
    { timeout: 10000 },
  )
}

test.describe('Quote preview + send (E5-S3)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('preview renders persisted quote in draft state', async ({ page }) => {
    const id = await pickFreshPropertyId(page)
    await buildAndSaveDraft(page, id)

    await expect(page.getByTestId('quote-preview')).toBeVisible()
    await expect(page.getByTestId('quote-number')).toContainText('Q-')
    await expect(page.getByTestId('quote-status')).toHaveAttribute(
      'data-status',
      'draft',
    )
    await expect(page.locator('[data-testid="preview-line-item"]')).toHaveCount(1)
    await expect(page.getByTestId('preview-totals-subtotal')).toHaveText('$1,500.00')
    await expect(page.getByTestId('preview-totals-total')).toHaveText('$1,650.00')
    await expect(page.getByTestId('send-button')).toBeVisible()
  })

  test('Send button transitions the quote to sent and shows a toast', async ({ page }) => {
    const id = await pickFreshPropertyId(page)
    await buildAndSaveDraft(page, id)

    await page.getByTestId('send-button').click()

    await expect(page.getByTestId('quote-status')).toHaveAttribute(
      'data-status',
      'sent',
    )
    await expect(page.getByTestId('send-button')).toHaveCount(0)
    // After send, the Mark-accepted CTA appears (E6-S2 wired the
    // accept transition into the same surface).
    await expect(page.getByTestId('accept-button')).toBeVisible()
    // Toast surfaced.
    await expect(page.getByText('Quote sent')).toBeVisible()
  })

})

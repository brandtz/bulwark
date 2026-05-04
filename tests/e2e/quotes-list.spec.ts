/**
 * tests/e2e/quotes-list.spec.ts — E5-S4.
 *
 * # Decisions (ADR-0007)
 *   - Three tests. (1) Empty state on first visit (no quotes exist
 *     yet in the mock). (2) After building two quotes via the builder,
 *     the list shows both rows; total count reflects the build. (3)
 *     Status filter (`?status=sent`) excludes drafts.
 *   - We build quotes through the UI so all mock mutations stay in
 *     the same client-side module the list page reads from. Both the
 *     list page and preview page use `useAsyncData(\u2026, { server: false })`
 *     so the SSR-vs-CSR mock-state divergence never surfaces.
 *   - Each test uses a fresh worker context (Playwright default) so
 *     prior test's quotes don't bleed in. The list assertions are
 *     therefore deterministic.
 *
 * # Decision cast down
 *   - Rejected: a pagination test. Fixture-scale never overflows
 *     pageSize 100; pagination wiring lands when the server impl does.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickTwoPropertyIds(page: Page): Promise<[string, string]> {
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const cards = page.locator('[data-testid="property-card"]')
  await expect(cards.first()).toBeVisible()
  const first = await cards.first().getAttribute('data-property-id')
  const last = await cards.last().getAttribute('data-property-id')
  expect(first).toBeTruthy()
  expect(last).toBeTruthy()
  expect(first).not.toEqual(last)
  return [first as string, last as string]
}

async function buildQuoteAndStayOnPreview(
  page: Page,
  propertyId: string,
  unitCost: string,
  options: { initialGoto?: boolean } = {},
): Promise<void> {
  if (options.initialGoto !== false) {
    await page.goto(`/admin/properties/${propertyId}/quotes/new`)
    await page.waitForLoadState('networkidle')
  } else {
    // Navigate client-side: pipeline → property detail → Quotes tab → New quote CTA.
    await page.locator(`[data-property-id="${propertyId}"]`).first().click()
    await page.waitForURL(new RegExp(`/admin/properties/${propertyId}(?:\\?.*)?$`))
    await page.getByRole('tab', { name: 'Quotes' }).click()
    await page.getByTestId('tab-new-quote-cta').click()
    await page.waitForURL(new RegExp(`/admin/properties/${propertyId}/quotes/new$`))
  }
  await page
    .getByTestId('line-item-0-description')
    .locator('input')
    .fill('Line item')
  await page.getByTestId('line-item-0-unit-cost').locator('input').fill(unitCost)
  await page.getByTestId('submit-button').click()
  await page.waitForURL(
    new RegExp(`/admin/properties/${propertyId}/quotes/[\\w-]+$`),
    { timeout: 10000 },
  )
}

test.describe('Quotes list (E5-S4)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('shows empty state when no quotes exist', async ({ page }) => {
    await page.goto('/admin/quotes')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('quotes-list')).toBeVisible()
    await expect(page.getByTestId('quotes-empty')).toBeVisible()
  })

  test('lists quotes built during the session', async ({ page }) => {
    const [id1, id2] = await pickTwoPropertyIds(page)
    await buildQuoteAndStayOnPreview(page, id1, '1500')
    // Navigate client-side to the second property's builder via the sidebar
    // → properties pipeline → property detail → Quotes tab CTA. That keeps the
    // mock state intact.
    await page.getByRole('link', { name: 'Properties', exact: true }).first().click()
    await page.waitForURL(/\/admin\/properties(?:\?.*)?$/)
    await buildQuoteAndStayOnPreview(page, id2, '2200', { initialGoto: false })

    // Navigate via the sidebar Quotes link — client-side navigation
    // preserves the mock module state. `page.goto` would reload JS.
    await page.getByRole('link', { name: 'Quotes', exact: true }).first().click()
    await page.waitForURL(/\/admin\/quotes(?:\?.*)?$/)

    const rows = page.locator('[data-testid="quote-row"]')
    await expect(rows).toHaveCount(2)
    // Most recent first by createdAt desc.
    await expect(rows.first().getByTestId('quote-row-number')).toContainText('Q-')
  })

  test('status filter narrows results to sent quotes', async ({ page }) => {
    const [id1, id2] = await pickTwoPropertyIds(page)
    await buildQuoteAndStayOnPreview(page, id1, '500')
    // First build is now on the preview page — leave it as draft.

    await page.getByRole('link', { name: 'Properties', exact: true }).first().click()
    await page.waitForURL(/\/admin\/properties(?:\?.*)?$/)
    await buildQuoteAndStayOnPreview(page, id2, '900', { initialGoto: false })
    // Send the second quote.
    await page.getByTestId('send-button').click()
    await expect(page.getByTestId('quote-status')).toHaveAttribute(
      'data-status',
      'sent',
    )

    await page.getByRole('link', { name: 'Quotes', exact: true }).first().click()
    await page.waitForURL(/\/admin\/quotes(?:\?.*)?$/)
    // Apply the Sent filter via the segmented control so navigation
    // stays client-side.
    await page.getByRole('tab', { name: 'Sent' }).click()
    await page.waitForURL(/\/admin\/quotes\?status=sent$/)

    const rows = page.locator('[data-testid="quote-row"]')
    await expect(rows).toHaveCount(1)
    await expect(rows.first().getByTestId('quote-row-status')).toHaveAttribute(
      'data-status',
      'sent',
    )
  })
})

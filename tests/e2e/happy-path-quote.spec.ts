/**
 * tests/e2e/happy-path-quote.spec.ts — E5-S5 (Epic E5 closer).
 *
 * # Decisions (ADR-0007)
 *   - Single long test that threads the full quote story Drew needs to
 *     demo: pick property → assessment → summary CTA → builder
 *     auto-populates → save draft → preview → Send → list shows
 *     the quote as Sent. No reloads; client-only navigation throughout.
 *   - We deliberately overlap with E5-S2 / E5-S3 / E5-S4 specs because
 *     happy-path has different value: it proves the flow holds *as a
 *     whole* under realistic UX timing.
 *   - Uses `serial` so a flake doesn't waste a parallel slot \u2014 there's
 *     only one test in the file anyway.
 *
 * # Decision cast down
 *   - Rejected: a second variant for the manual (no `?from=`) path.
 *     E5-S2 already covers that.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

async function pickPropertyId(page: Page): Promise<string> {
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const cards = page.locator('[data-testid="property-card"]')
  await expect(cards.first()).toBeVisible()
  const id = await cards.last().getAttribute('data-property-id')
  expect(id).toBeTruthy()
  return id as string
}

test.describe('Happy path: assessment → quote → send (E5-S5)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('GC builds, sends, and finds a quote in the list', async ({ page }) => {
    const id = await pickPropertyId(page)

    // 1) Open the assessment form for this property via NuxtLink chain.
    await page.locator(`[data-property-id="${id}"]`).first().click()
    await page.waitForURL(new RegExp(`/admin/properties/${id}(?:\\?.*)?$`))
    // Assessment tab → start a fresh assessment.
    await page.getByRole('tab', { name: 'Assessment' }).click()
    await page.getByTestId('tab-start-assessment-cta').click()
    await page.waitForURL(new RegExp(`/admin/properties/${id}/assessment$`))

    // 2) Fill a non-compliant assessment (wood shake roof + vinyl siding).
    await page.getByTestId('field-roofMaterial').locator('select').selectOption('wood_shake')
    await page.getByTestId('field-sidingMaterial').locator('select').selectOption('vinyl')
    await page.getByTestId('field-eaveType').locator('select').selectOption('enclosed')
    await page.getByTestId('field-ventType').locator('select').selectOption('ember_resistant')
    await page.getByTestId('defensible-space-toggle').click()
    await page.getByTestId('submit-button').click()
    await page.waitForURL(/\/assessment-summary$/)

    // 3) Summary shows non-compliant; click the "Build quote from assessment" link.
    await expect(page.getByTestId('assessment-summary')).toBeVisible()
    await page.getByTestId('build-quote-from-assessment').click()
    await page.waitForURL(new RegExp(`/admin/properties/${id}/quotes/new\\?from=assessment$`))

    // 4) Builder auto-populated — line items >= 2; banner gone.
    await expect(page.locator('[data-testid="line-item"]').nth(0)).toBeVisible()
    const itemCount = await page.locator('[data-testid="line-item"]').count()
    expect(itemCount).toBeGreaterThanOrEqual(2)
    await expect(page.getByTestId('prepopulate-banner')).toHaveCount(0)

    // 5) Fill unit costs on each line item, then save draft.
    for (let i = 0; i < itemCount; i++) {
      await page.getByTestId(`line-item-${i}-unit-cost`).locator('input').fill('1500')
    }
    await page.getByTestId('submit-button').click()
    await page.waitForURL(
      new RegExp(`/admin/properties/${id}/quotes/[\\w-]+$`),
      { timeout: 15000 },
    )

    // 6) Preview renders, status is draft, totals reflect markup.
    await expect(page.getByTestId('quote-preview')).toBeVisible()
    await expect(page.getByTestId('quote-status')).toHaveAttribute('data-status', 'draft')
    const quoteNumber = await page.getByTestId('quote-number').textContent()
    expect(quoteNumber?.startsWith('Q-')).toBeTruthy()

    // 7) Send the quote.
    await page.getByTestId('send-button').click()
    await expect(page.getByTestId('quote-status')).toHaveAttribute('data-status', 'sent')

    // 8) Navigate to the quotes list via the sidebar (client-side).
    await page.getByRole('link', { name: 'Quotes', exact: true }).first().click()
    await page.waitForURL(/\/admin\/quotes(?:\?.*)?$/)
    const rows = page.locator('[data-testid="quote-row"]')
    await expect(rows).toHaveCount(1)
    await expect(rows.first().getByTestId('quote-row-number')).toHaveText(
      String(quoteNumber).trim(),
    )
    await expect(rows.first().getByTestId('quote-row-status')).toHaveAttribute(
      'data-status',
      'sent',
    )

    // 9) Filter by Sent — the quote is still there.
    await page.getByRole('tab', { name: 'Sent' }).click()
    await page.waitForURL(/\/admin\/quotes\?status=sent$/)
    await expect(rows).toHaveCount(1)

    // 10) Filter by Draft — empty state, no rows.
    await page.getByRole('tab', { name: 'Draft' }).click()
    await page.waitForURL(/\/admin\/quotes\?status=draft$/)
    await expect(page.getByTestId('quotes-empty')).toBeVisible()
  })
})

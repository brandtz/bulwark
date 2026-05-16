/**
 * tests/e2e/quote-revise-reject.spec.ts — W2-3b / EH-G.
 *
 * # Decisions (ADR-0007)
 *   - Two flows in one file. (1) Draft → Send → Revise spawns a new
 *     quote in the same revisionGroup, navigates to v2, and shows a
 *     `quote-revision-badge` reading "v2". (2) Draft → Send → Reject
 *     opens the reject modal, captures reason code + free text, and
 *     after submission the detail status flips to `rejected` and the
 *     rejection details panel renders.
 *   - Mock backend only.
 *
 * # Decision cast down
 *   - Rejected: a Playwright fixture that pre-creates the quote via
 *     the service layer. The UI walk is the contract we're verifying.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickPropertyId(page: Page): Promise<string> {
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const card = page.locator('[data-testid="property-card"]').first()
  await expect(card).toBeVisible()
  const id = await card.getAttribute('data-property-id')
  expect(id).toBeTruthy()
  return id as string
}

async function authorAndSendQuote(page: Page, propertyId: string): Promise<void> {
  await page.goto(`/admin/properties/${propertyId}/quotes/new`)
  await page.waitForLoadState('networkidle')
  await page
    .getByTestId('line-item-0-description')
    .locator('input')
    .fill('Initial scope')
  await page.getByTestId('line-item-0-unit-cost').locator('input').fill('1500')
  await page.getByTestId('submit-button').click()
  await page.waitForURL(
    new RegExp(`/admin/properties/${propertyId}/quotes/[\\w-]+$`),
    { timeout: 10_000 },
  )
  // Detail page shows a Send button while draft.
  await page.getByTestId('send-button').click()
  await expect(page.getByTestId('quote-status')).toHaveAttribute('data-status', 'sent')
}

test.describe('Quote revise + reject (W2-3b)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('Revise produces v2 with a revision badge', async ({ page }) => {
    const propertyId = await pickPropertyId(page)
    await authorAndSendQuote(page, propertyId)
    await page.getByTestId('revise-button').click()
    // Lands on the new (v2) detail page.
    await page.waitForURL(
      new RegExp(`/admin/properties/${propertyId}/quotes/[\\w-]+$`),
      { timeout: 10_000 },
    )
    await expect(page.getByTestId('quote-revision-badge')).toContainText(/v2/i)
  })

  test('Reject captures reason and flips status', async ({ page }) => {
    const propertyId = await pickPropertyId(page)
    await authorAndSendQuote(page, propertyId)
    await page.getByTestId('reject-button').click()
    await expect(page.getByTestId('reject-modal')).toBeVisible()
    await page.getByTestId('reject-reason-code').locator('select').selectOption('price')
    await page
      .getByTestId('reject-reason-text')
      .locator('textarea')
      .fill('Too high vs. competing bid.')
    await page.getByTestId('reject-submit-button').click()
    await expect(page.getByTestId('quote-status')).toHaveAttribute('data-status', 'rejected')
    await expect(page.getByTestId('preview-rejection')).toBeVisible()
  })
})

/**
 * tests/e2e/work-order-create.spec.ts — E6-S2.
 *
 * # Decisions (ADR-0007)
 *   - One end-to-end flow per spec. Build a quote through the UI \u2192
 *     send it \u2192 mark accepted \u2192 click "Create work order" \u2192 land on
 *     the new-WO page with a trade slot pre-derived from the line item
 *     \u2192 submit \u2192 land on the WO detail page with the WO number visible.
 *   - All navigation between mutations is client-side (NuxtLink clicks
 *     and `router.push` redirects from forms). The new-WO page uses
 *     `useAsyncData(\u2026 { server: false })` so the freshly-accepted quote
 *     is readable on first paint.
 *   - We don't assert exact trade IDs because `crypto.randomUUID()`
 *     differs per run; we assert the slot count + the trade attribute.
 *
 * # Decision cast down
 *   - Rejected: covering the manual `Add trade` button. That's a
 *     non-blocking polish path; if it broke the submit button's
 *     enabled-state guard would still keep the form honest.
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

async function buildSendAcceptQuote(
  page: Page,
  propertyId: string,
): Promise<string> {
  // Build a draft quote with one line item.
  await page.goto(`/admin/properties/${propertyId}/quotes/new`)
  await page.waitForLoadState('networkidle')
  await page
    .getByTestId('line-item-0-description')
    .locator('input')
    .fill('Replace wood-shake roof with metal')
  await page.getByTestId('line-item-0-unit-cost').locator('input').fill('2000')
  await page.getByTestId('submit-button').click()
  await page.waitForURL(
    new RegExp(`/admin/properties/${propertyId}/quotes/[\\w-]+$`),
    { timeout: 10000 },
  )

  // Send.
  await page.getByTestId('send-button').click()
  await expect(page.getByTestId('quote-status')).toHaveAttribute(
    'data-status',
    'sent',
  )

  // Accept.
  await page.getByTestId('accept-button').click()
  await expect(page.getByTestId('quote-status')).toHaveAttribute(
    'data-status',
    'accepted',
  )

  const url = new URL(page.url())
  const parts = url.pathname.split('/')
  const quoteId = parts[parts.length - 1]!
  return quoteId
}

test.describe('Create work order from accepted quote (E6-S2)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('accepted quote routes to create-WO page with pre-filled trades', async ({
    page,
  }) => {
    const id = await pickFreshPropertyId(page)
    await buildSendAcceptQuote(page, id)

    // Click the Create work order CTA from the accepted quote preview.
    await page.getByTestId('create-work-order-cta').click()
    await page.waitForURL(
      new RegExp(`/admin/properties/${id}/work-orders/new\\?quoteId=[\\w-]+$`),
    )

    await expect(page.getByTestId('work-order-new')).toBeVisible()
    await expect(page.getByTestId('source-quote')).toContainText('Q-')

    // Pre-derived slots: at least one, and the description carries the
    // line-item text we typed.
    const slots = page.getByTestId('trade-slot')
    expect(await slots.count()).toBeGreaterThanOrEqual(1)
    const firstDesc = slots
      .first()
      .getByTestId('trade-slot-0-description')
      .locator('input')
    await expect(firstDesc).toHaveValue(/wood-shake|metal/i)
  })

  test('submit creates the WO and lands on the detail page', async ({
    page,
  }) => {
    const id = await pickFreshPropertyId(page)
    await buildSendAcceptQuote(page, id)

    await page.getByTestId('create-work-order-cta').click()
    await page.waitForURL(
      new RegExp(`/admin/properties/${id}/work-orders/new\\?quoteId=[\\w-]+$`),
    )

    await page.getByTestId('submit-button').click()
    await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/, { timeout: 10000 })

    await expect(page.getByTestId('work-order-detail')).toBeVisible()
    await expect(page.getByTestId('work-order-number')).toHaveText(
      /WO-\d{4}-\d{4}/,
    )
    await expect(page.getByTestId('work-order-status')).toHaveAttribute(
      'data-status',
      'draft',
    )
  })
})

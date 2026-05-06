/**
 * tests/e2e/happy-path-work-order.spec.ts — E6-S6 (Epic E6 closer).
 *
 * # Decisions (ADR-0007)
 *   - Single long serial test that threads the closing flow Drew needs
 *     to demo: build a draft quote on a fresh property → send → accept
 *     → create work order from the accepted quote → assign a sub to a
 *     trade slot → click Start work → assert the slot status flips to
 *     `in_progress` and the WO envelope status follows
 *     (`deriveEnvelopeStatus` rule). All navigation is client-side
 *     (NuxtLink clicks + form `router.push` redirects) per the
 *     mock-state rule.
 *   - Overlaps with E6-S2..E6-S4 specs deliberately. Happy path proves
 *     the chain holds end-to-end — that's the value, not isolation.
 *   - We pick the assigned sub by trade-matched candidate count rather
 *     than by name so we don't depend on fixture ordering.
 *
 * # Decision cast down
 *   - Rejected: a second variant for the unhappy "blocked" branch.
 *     E6-S4 already covers the blocked transition in isolation; adding
 *     it here would balloon the runtime without proving anything new.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

async function pickFreshPropertyId(page: Page): Promise<string> {
  await page.goto('/admin/properties?view=list')
  await page.waitForLoadState('networkidle')
  const cards = page.locator('[data-testid="property-card"]')
  await expect(cards.first()).toBeVisible()
  const id = await cards.last().getAttribute('data-property-id')
  expect(id).toBeTruthy()
  return id as string
}

test.describe('Happy path: quote → WO → assign → start (E6-S6)', () => {
  test.beforeAll(async () => {
    const { reseedRealBackend } = await import('./_reseed')
    reseedRealBackend()
  })

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('GC accepts quote, creates WO, assigns roofer, starts the job', async ({
    page,
  }) => {
    const propertyId = await pickFreshPropertyId(page)

    // 1) Build a draft quote with a roofing line item.
    await page.goto(`/admin/properties/${propertyId}/quotes/new`)
    await page.waitForLoadState('networkidle')
    await page
      .getByTestId('line-item-0-description')
      .locator('input')
      .fill('Replace wood-shake roof with metal')
    await page
      .getByTestId('line-item-0-unit-cost')
      .locator('input')
      .fill('2000')
    await page.getByTestId('submit-button').click()
    await page.waitForURL(
      new RegExp(`/admin/properties/${propertyId}/quotes/[\\w-]+$`),
      { timeout: 15000 },
    )

    // 2) Send the quote.
    await page.getByTestId('send-button').click()
    await expect(page.getByTestId('quote-status')).toHaveAttribute(
      'data-status',
      'sent',
    )

    // 3) Accept it.
    await page.getByTestId('accept-button').click()
    await expect(page.getByTestId('quote-status')).toHaveAttribute(
      'data-status',
      'accepted',
    )

    // 4) Click Create work order → land on the new-WO page with pre-derived slots.
    await page.getByTestId('create-work-order-cta').click()
    await page.waitForURL(
      new RegExp(
        `/admin/properties/${propertyId}/work-orders/new\\?quoteId=[\\w-]+$`,
      ),
    )
    const slotsOnNew = page.getByTestId('trade-slot')
    // Wait for the derived-slots watch to fire (real backend roundtrip can be
    // a few hundred ms slower than the in-memory mock).
    await expect(slotsOnNew.first()).toBeVisible({ timeout: 10000 })
    expect(await slotsOnNew.count()).toBeGreaterThanOrEqual(1)

    // 5) Submit the WO → land on detail page.
    await page.getByTestId('submit-button').click()
    await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/, { timeout: 15000 })
    await expect(page.getByTestId('work-order-detail')).toBeVisible()

    // Brand-new WO with all slots unassigned → envelope status = draft.
    await expect(page.getByTestId('work-order-status')).toHaveAttribute(
      'data-status',
      'draft',
    )

    // 6) Pick the first slot and open the assign-sub picker.
    const firstSlot = page.getByTestId('trade-slot').first()
    await firstSlot.locator('[data-testid="assign-sub-button"]').click()
    await expect(page.getByTestId('assign-sub-modal')).toBeVisible()

    // 7) Pick the first trade-matched candidate.
    const firstCandidate = page
      .getByTestId('assign-candidate-button')
      .first()
    await expect(firstCandidate).toBeVisible()
    await firstCandidate.click()

    // Modal closes; slot status flips to assigned.
    await expect(page.getByTestId('assign-sub-modal')).toHaveCount(0)
    await expect(
      firstSlot.locator('[data-testid="trade-slot-status"]'),
    ).toHaveAttribute('data-status', 'assigned')

    // Envelope flips from draft → scheduled (assigned slot, no in_progress yet).
    await expect(page.getByTestId('work-order-status')).toHaveAttribute(
      'data-status',
      'scheduled',
    )

    // 8) Click Start work on the assigned slot.
    await firstSlot.locator('[data-testid="progress-start"]').click()

    // Slot status = in_progress.
    await expect(
      firstSlot.locator('[data-testid="trade-slot-status"]'),
    ).toHaveAttribute('data-status', 'in_progress')

    // Envelope follows: any slot in_progress → in_progress.
    await expect(page.getByTestId('work-order-status')).toHaveAttribute(
      'data-status',
      'in_progress',
    )
  })
})

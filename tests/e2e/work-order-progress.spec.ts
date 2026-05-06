/**
 * tests/e2e/work-order-progress.spec.ts — E6-S4.
 *
 * # Decisions (ADR-0007)
 *   - Two tests against the seed work order. (1) The roofing slot
 *     starts in `assigned`; click Start work \u2192 status `in_progress`,
 *     Mark complete \u2192 `completed`. (2) The defensible_space slot is
 *     unassigned, so the updater renders the needs-assignment hint and
 *     no Start button is exposed.
 *   - Detail page is `{ server: false }` and the seed fixture lives in
 *     the same module the mock mutates, so `page.goto` is safe in
 *     these read/write flows (no cross-module state to lose).
 *   - We don't test photo capture \u2014 the placeholder is intentionally
 *     non-interactive.
 *
 * # Decision cast down
 *   - Rejected: the block / resume branch. It's wired in the component
 *     and unit-style coverage is cheap, but adding a third UI test
 *     pads runtime without surfacing new integration risk.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function openSeedWorkOrder(page: Page): Promise<void> {
  await page.goto('/admin/work-orders')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('work-order-row').first().click()
  await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/)
  await expect(page.getByTestId('work-order-detail')).toBeVisible()
}

test.describe('Work order progress updater (E6-S4)', () => {
  test.beforeAll(async () => {
    // Real-backend mode: this spec mutates the seed roofing slot's status,
    // so reseeding from a known baseline is essential (also handles upstream
    // pollution from work-order-assign / -create).
    const { reseedRealBackend } = await import('./_reseed')
    reseedRealBackend()
  })

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('progresses an assigned slot through in_progress to completed', async ({
    page,
  }) => {
    await openSeedWorkOrder(page)

    const slot = page.locator('[data-testid="trade-slot"][data-trade="roofing"]')
    await expect(slot.getByTestId('trade-slot-status')).toHaveAttribute(
      'data-status',
      'assigned',
    )

    await slot.getByTestId('progress-start').click()
    await expect(slot.getByTestId('trade-slot-status')).toHaveAttribute(
      'data-status',
      'in_progress',
    )

    await slot.getByTestId('progress-complete').click()
    await expect(slot.getByTestId('trade-slot-status')).toHaveAttribute(
      'data-status',
      'completed',
    )
  })

  test('unassigned slot surfaces a needs-assignment hint', async ({ page }) => {
    await openSeedWorkOrder(page)

    const slot = page.locator(
      '[data-testid="trade-slot"][data-trade="defensible_space"]',
    )
    await expect(
      slot.getByTestId('progress-needs-assignment'),
    ).toBeVisible()
    await expect(slot.getByTestId('progress-start')).toHaveCount(0)
  })
})

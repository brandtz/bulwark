/**
 * tests/e2e/work-order-assign.spec.ts — E6-S3.
 *
 * # Decisions (ADR-0007)
 *   - Two tests against the seed work order. (1) Open the picker on the
 *     unassigned defensible_space slot, see Firebreak Clearing in the
 *     candidate list (only sub for that trade), click it, slot now shows
 *     the company name and the slot-status pill flips to `assigned`.
 *     (2) Open the picker on the already-assigned roofing slot, click
 *     Clear assignment, slot shows `Unassigned` and pill flips back to
 *     `unassigned`.
 *   - Read-only seed flow \u2014 no creation in either test \u2014 so we can
 *     navigate via `page.goto`. The detail page is `{ server: false }`
 *     so the seed fixture appears on first paint regardless.
 *
 * # Decision cast down
 *   - Rejected: testing the "no candidates" message. The seed fixtures
 *     intentionally cover every trade; building a no-candidates state
 *     would require mutating the subcontractor service mid-test, which
 *     adds plumbing for limited value.
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

test.describe('Work order trade assignment (E6-S3)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('assigns Firebreak Clearing to the defensible_space slot', async ({
    page,
  }) => {
    await openSeedWorkOrder(page)

    const slot = page.locator('[data-testid="trade-slot"][data-trade="defensible_space"]')
    await expect(slot).toBeVisible()
    await expect(slot.getByTestId('trade-slot-status')).toHaveAttribute(
      'data-status',
      'unassigned',
    )
    await expect(slot.getByTestId('trade-slot-sub')).toHaveText('Unassigned')

    await slot.getByTestId('assign-sub-button').click()
    await expect(page.getByTestId('assign-sub-modal')).toBeVisible()

    const candidate = page.getByTestId('assign-candidate').first()
    await expect(candidate).toContainText(/Firebreak/)
    await candidate.getByTestId('assign-candidate-button').click()

    await expect(page.getByTestId('assign-sub-modal')).toBeHidden()
    await expect(slot.getByTestId('trade-slot-sub')).toContainText(/Firebreak/)
    await expect(slot.getByTestId('trade-slot-status')).toHaveAttribute(
      'data-status',
      'assigned',
    )
  })

  test('clears an existing assignment on the roofing slot', async ({ page }) => {
    await openSeedWorkOrder(page)

    const slot = page.locator('[data-testid="trade-slot"][data-trade="roofing"]')
    await expect(slot).toBeVisible()
    await expect(slot.getByTestId('trade-slot-status')).toHaveAttribute(
      'data-status',
      'assigned',
    )

    await slot.getByTestId('assign-sub-button').click()
    await expect(page.getByTestId('assign-sub-modal')).toBeVisible()
    await page.getByTestId('assign-clear-button').click()

    await expect(page.getByTestId('assign-sub-modal')).toBeHidden()
    await expect(slot.getByTestId('trade-slot-sub')).toHaveText('Unassigned')
    await expect(slot.getByTestId('trade-slot-status')).toHaveAttribute(
      'data-status',
      'unassigned',
    )
  })
})

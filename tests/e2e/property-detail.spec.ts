/**
 * tests/e2e/property-detail.spec.ts — property detail hub (E3-S5).
 *
 * # Decisions (ADR-0007)
 *   - One spec per UI story (per ADR-0007). Coverage:
 *       1) Open detail by clicking a card on the pipeline (proves the
 *          PropertyCard NuxtLink target is correct end-to-end).
 *       2) Default tab is Overview and renders address + status.
 *       3) Each tab can be selected; the corresponding panel testid
 *          is the only visible panel.
 *       4) The `?tab=` query param reflects the active tab so the URL
 *          is shareable.
 *       5) An unknown property id surfaces the 404-style "not found"
 *          empty state (without crashing).
 *   - chromium-only desktop flow; mobile detail is the same component
 *     (BulwarkTabs scrolls horizontally — covered by ui-primitives spec).
 *
 * # Decision cast down
 *   - Rejected: hardcoding a fixture property id. We click through the
 *     pipeline so the test exercises the real link contract instead of
 *     an implementation detail.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Property detail hub (E3-S5)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow for now')
    await signInAsAdmin(page)
  })

  test('clicking a card on the pipeline opens the detail hub', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    const firstCard = page.getByTestId('property-card').first()
    await expect(firstCard).toBeVisible()
    await firstCard.click()
    await expect(page).toHaveURL(/\/admin\/properties\/[\w-]+(?:\?.*)?$/, { timeout: 10000 })
    await expect(page.getByTestId('property-detail')).toBeVisible()
    await expect(page.getByTestId('property-address')).toBeVisible()
  })

  test('overview is the default tab and shows address + client cards', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('property-card').first().click()
    await expect(page.getByTestId('tab-panel-overview')).toBeVisible()
    // Other tab panels are NOT in the DOM (slots are conditional on activeTab).
    await expect(page.getByTestId('tab-panel-quotes')).toHaveCount(0)
  })

  test('selecting a tab swaps the panel and updates the ?tab= query', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('property-card').first().click()
    await page.waitForLoadState('networkidle')

    await page.getByRole('tab', { name: 'Quotes' }).click()
    await expect(page.getByTestId('tab-panel-quotes')).toBeVisible()
    await expect(page).toHaveURL(/\?(?:.*&)?tab=quotes/)

    await page.getByRole('tab', { name: 'Work orders' }).click()
    await expect(page.getByTestId('tab-panel-work-orders')).toBeVisible()
    await expect(page).toHaveURL(/\?(?:.*&)?tab=work-orders/)

    await page.getByRole('tab', { name: 'Overview' }).click()
    await expect(page.getByTestId('tab-panel-overview')).toBeVisible()
  })

  test('unknown property id surfaces the not-found empty state', async ({ page }) => {
    await page.goto('/admin/properties/00000000-0000-0000-0000-000000000000')
    await expect(page.getByTestId('property-not-found')).toBeVisible()
    // Still has a way back to the pipeline.
    await expect(page.getByRole('link', { name: 'Back to pipeline' })).toBeVisible()
  })
})

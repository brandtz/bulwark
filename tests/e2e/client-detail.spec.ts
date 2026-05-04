/**
 * tests/e2e/client-detail.spec.ts — clients list + detail (E3-S6).
 *
 * # Decisions (ADR-0007)
 *   - One spec covers both the index list and the detail page since
 *     they're co-introduced in this story and the detail-from-property
 *     edge is the most important path (clicking the "View client
 *     profile" link from the property hub).
 *   - chromium-only desktop flow.
 *
 * # Decision cast down
 *   - Rejected: hardcoding a fixture client id. We click through the
 *     UI so the navigation contract itself is exercised.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Clients list + detail (E3-S6)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow for now')
    await signInAsAdmin(page)
  })

  test('clients list renders rows and links to the detail page', async ({ page }) => {
    await page.goto('/admin/clients')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('clients-list')).toBeVisible()
    const firstRow = page.getByTestId('client-row').first()
    await expect(firstRow).toBeVisible()
    await firstRow.click()
    await expect(page).toHaveURL(/\/admin\/clients\/[\w-]+$/, { timeout: 10000 })
    await expect(page.getByTestId('client-detail')).toBeVisible()
    await expect(page.getByTestId('client-name')).toBeVisible()
  })

  test('client detail lists their linked properties', async ({ page }) => {
    await page.goto('/admin/clients')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('client-row').first().click()
    await page.waitForLoadState('networkidle')
    // Either there are property rows OR the "no properties" empty state.
    const rows = page.getByTestId('client-property-row')
    const empty = page.getByTestId('client-no-properties')
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 10000 })
  })

  test('property detail Overview links to the client profile', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('property-card').first().click()
    await page.waitForLoadState('networkidle')
    const link = page.getByRole('link', { name: /View client profile/ })
    await expect(link).toBeVisible({ timeout: 10000 })
    await link.click()
    await expect(page).toHaveURL(/\/admin\/clients\/[\w-]+$/, { timeout: 10000 })
    await expect(page.getByTestId('client-detail')).toBeVisible()
  })

  test('unknown client id surfaces the not-found empty state', async ({ page }) => {
    await page.goto('/admin/clients/00000000-0000-0000-0000-000000000000')
    await expect(page.getByTestId('client-not-found')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to clients' })).toBeVisible()
  })
})

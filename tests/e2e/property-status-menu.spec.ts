/**
 * tests/e2e/property-status-menu.spec.ts — inline status change (E3-S3).
 *
 * # Decisions (ADR-0007)
 *   - The story originally called for drag-drop on desktop + long-press on
 *     mobile. We're shipping an explicit `<PropertyStatusMenu>` instead so
 *     the test surface is deterministic. See the `PropertyStatusMenu.vue`
 *     header for the rationale.
 *   - chromium-only desktop run; the menu also renders on mobile but the
 *     mobile UX of full-screen action sheet will land in a follow-up
 *     story (FT-12 mobile parity).
 *
 * # Decision cast down
 *   - Rejected: asserting against `page.dragTo()` between columns. Even
 *     when it works locally it fails on CI ~10% of the time.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Property status menu (E3-S3)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow for now')
    await signInAsAdmin(page)
  })

  test('menu opens, lists all 13 statuses, and current is marked', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    const card = page.getByTestId('property-card').first()
    await card.getByTestId('status-menu-button').click()
    const panel = card.getByTestId('status-menu-panel')
    await expect(panel).toBeVisible()
    // 13 status options in the menu.
    await expect(panel.getByRole('menuitem')).toHaveCount(13)
    // The card's current status row shows "current" badge.
    await expect(panel.getByText('current', { exact: true })).toHaveCount(1)
  })

  test('clicking a menu item moves the card to the chosen column', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')

    // Pick a card from the `lead` column we know is seeded.
    const leadColumn = page.locator('[data-testid="pipeline-column"][data-status="lead"]')
    const card = leadColumn.getByTestId('property-card').first()
    await expect(card).toBeVisible()
    const propertyId = await card.getAttribute('data-property-id')
    expect(propertyId).toBeTruthy()

    await card.getByTestId('status-menu-button').click()
    await card.getByTestId('status-menu-item-on_hold').click()

    // The card should now appear in the `on_hold` column with the same id.
    const movedCard = page.locator(
      `[data-testid="pipeline-column"][data-status="on_hold"] [data-property-id="${propertyId}"]`,
    )
    await expect(movedCard).toBeVisible({ timeout: 10000 })

    // And it should no longer be in the `lead` column.
    const oldCard = page.locator(
      `[data-testid="pipeline-column"][data-status="lead"] [data-property-id="${propertyId}"]`,
    )
    await expect(oldCard).toHaveCount(0)
  })

  test('clicking the menu does not navigate to the detail page', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    const card = page.getByTestId('property-card').first()
    await card.getByTestId('status-menu-button').click()
    await expect(card.getByTestId('status-menu-panel')).toBeVisible()
    // We should still be on the pipeline page, not in the detail hub.
    await expect(page).toHaveURL(/\/admin\/properties$/)
  })
})

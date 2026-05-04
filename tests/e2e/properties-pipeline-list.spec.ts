/**
 * tests/e2e/properties-pipeline-list.spec.ts — list view + FT-12 segmented
 * toggle for the properties pipeline (E3-S2).
 *
 * # Decisions (ADR-0007)
 *   - Separate spec from `properties-pipeline.spec.ts` so the kanban story
 *     (E3-S1) stays a tidy chromium-only file. THIS spec deliberately runs
 *     on all three projects (desktop chromium, mobile-safari, mobile-chrome)
 *     so we get free coverage of the mobile-default-to-list behavior.
 *   - We assert the toggle's visual state via `aria-selected` on the
 *     `<button role="tab">` rather than CSS classes, so a future tailwind
 *     refactor doesn't break tests.
 *
 * # Decision cast down
 *   - Rejected: forcing `await page.setViewportSize(...)` to fake mobile in
 *     a chromium-only test. The Playwright project matrix already gives us
 *     a real mobile context (touch + correct UA + correct dpr); using a
 *     fake viewport hides device-specific bugs.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Pipeline view toggle (E3-S2)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('toggle is visible and offers Kanban + List options', async ({ page }) => {
    await page.goto('/admin/properties')
    const toggle = page.getByTestId('pipeline-view-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle.getByRole('tab', { name: 'Kanban' })).toBeVisible()
    await expect(toggle.getByRole('tab', { name: 'List' })).toBeVisible()
  })

  test('switching to List shows the list view and hides kanban columns', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    await page.getByRole('tab', { name: 'List' }).click()
    await expect(page.getByTestId('pipeline-list')).toBeVisible()
    await expect(page.getByTestId('pipeline-column').first()).not.toBeVisible()
    // Cards still exist (rendered inside the list).
    await expect(page.getByTestId('property-card').first()).toBeVisible()
  })

  test('switching back to Kanban restores columns', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    await page.getByRole('tab', { name: 'List' }).click()
    await page.getByRole('tab', { name: 'Kanban' }).click()
    await expect(page.getByTestId('pipeline-column').first()).toBeVisible()
    await expect(page.getByTestId('pipeline-list')).toHaveCount(0)
  })

  test('mobile viewports default to the list view after mount', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium', 'chromium is the desktop default')
    await page.goto('/admin/properties')
    await expect(page.getByTestId('pipeline-list')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true')
  })
})

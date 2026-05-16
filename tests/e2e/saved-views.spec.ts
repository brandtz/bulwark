/**
 * tests/e2e/saved-views.spec.ts — W4-2 (deferred from W3-5 / EH-P /
 * ADR-0033).
 *
 * # Status: SKIPPED
 *   - The W3-5 handoff defers the saved-views dropdown UI on
 *     `/admin/properties` and the manage page at
 *     `/settings/saved-views`. `ISavedViewService` (contract + real
 *     impl + migration `0009_free_clea.sql`) is in source; only the
 *     UI is missing.
 *   - Unskip once `data-testid="views-menu"` ships on the properties
 *     list page.
 *
 * # Planned flow once unskipped
 *   1. Admin opens `/admin/properties`, applies a filter (e.g. status =
 *      lead) and asserts the list narrows.
 *   2. Opens the Views menu, clicks "Save current view", names it
 *      "Open leads", confirms.
 *   3. Reloads the page; the filter clears.
 *   4. Opens Views menu and clicks the saved view; the filter
 *      re-applies and the list narrows back.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('Admin saved views (W4-2 / EH-P)', () => {
  test('admin can save and re-apply a properties view', async ({ page }) => {
    test.skip(
      true,
      'TODO: unskip once the saved-views dropdown UI ships on /admin/properties (see W3-5 handoff Deferred section).',
    )

    await signInAsAdmin(page)
    await page.goto('/admin/properties?view=list')
    await page.getByTestId('property-status-filter').selectOption('lead')
    await page.getByTestId('views-menu').click()
    await page.getByTestId('views-menu-save').click()
    await page.getByTestId('views-save-name').fill('Open leads')
    await page.getByTestId('views-save-submit').click()
    await page.reload()
    await page.getByTestId('views-menu').click()
    await page.getByTestId('views-menu-item-Open-leads').click()
    await expect(page.getByTestId('property-status-filter')).toHaveValue('lead')
  })
})

/**
 * tests/e2e/global-search.spec.ts — W4-2 (deferred from W3-5 / EH-P /
 * ADR-0033).
 *
 * # Status: SKIPPED
 *   - The W3-5 handoff explicitly defers the search palette UI to a
 *     downstream slice ("`app/components/search/SearchPalette.vue`,
 *     `AppTopBar.vue` Cmd-K/Ctrl-K listener" — not yet in source).
 *   - The contract (`ISearchService.search`) and the real-backend
 *     implementation ARE live; this spec is the placeholder coverage
 *     for when the UI lands. Unskip when `data-testid="global-search-input"`
 *     ships in the topbar.
 *
 * # Planned flow once unskipped
 *   1. Admin presses Ctrl+K (or clicks the search affordance).
 *   2. Types a known property name (the seed has
 *      "1428 Hillcrest Ave").
 *   3. Asserts results appear grouped by entity type.
 *   4. Clicks a result and lands on the property detail page.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('Global search palette (W4-2 / EH-P)', () => {
  test('admin can search via Ctrl+K and click into a result', async ({ page }) => {
    test.skip(
      true,
      'TODO: unskip once the SearchPalette UI ships (see W3-5 handoff "Deferred — Presentation/UX layer").',
    )

    await signInAsAdmin(page)
    await page.goto('/admin')
    await page.keyboard.press('Control+K')
    await expect(page.getByTestId('global-search-input')).toBeVisible()
    await page.getByTestId('global-search-input').fill('Hillcrest')
    await expect(page.getByTestId('search-result-property').first()).toBeVisible()
    await page.getByTestId('search-result-property').first().click()
    await expect(page).toHaveURL(/\/admin\/properties\/[\w-]+/)
  })
})

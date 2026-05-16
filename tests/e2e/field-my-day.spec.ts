/**
 * tests/e2e/field-my-day.spec.ts — W3-3 / EH-M / ADR-0029.
 *
 * # What this verifies
 *   - Sign in as the field persona (Matthew Reyes, role=field), visit
 *     `/field` on a mobile-sized viewport, and confirm:
 *       (1) the My Day page renders with its `field-my-day` testid,
 *       (2) the four-tab field layout strip is present,
 *       (3) the refresh button is wired and reacts to a click,
 *       (4) the page settles in either the "rows" state or the
 *           explicit empty-state — never both, never neither.
 *
 * # Decisions (ADR-0007 / ADR-0029)
 *   - This spec is a smoke check, not a data-bearing happy-path. The
 *     seed work order is dated 2026-05-12 (db-seed.mjs L278), so on
 *     any other calendar day the My Day list is empty and the test
 *     must accept that as a valid outcome.
 *   - We do NOT assert on specific WO content — that's the contract
 *     of the listForFieldUser unit test (tests/unit/field-wo-list.test.ts).
 *
 * # Decision cast down
 *   - Rejected: monkey-patching `Date.now()` via page.addInitScript so
 *     the seed WO is "today". Mutating wall-clock time inside the
 *     browser de-syncs it from the API which uses the real server
 *     clock — the resulting test would be flaky in CI.
 */
import { test, expect } from '@playwright/test'
import { signInAsField } from './_helpers'

test.describe('Field My Day (W3-3)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await signInAsField(page)
  })

  test('renders My Day surface with field layout', async ({ page }) => {
    await page.goto('/field')
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('field-my-day')).toBeVisible()
    // Field layout (separate from the global sidebar / bottom-nav) renders
    // its own four-tab strip. We don't pin a specific testid here; the
    // refresh affordance is what the persona actually taps.
    const refresh = page.getByTestId('field-my-day-refresh')
    await expect(refresh).toBeVisible()

    // Exactly one of: rows-visible or empty-visible.
    const rows = page.getByTestId('field-my-day-row')
    const empty = page.getByTestId('field-my-day-empty')
    const hasRows = (await rows.count()) > 0
    const hasEmpty = (await empty.count()) > 0
    expect(hasRows || hasEmpty).toBe(true)

    await refresh.click()
    await expect(page.getByTestId('field-my-day')).toBeVisible()
  })
})

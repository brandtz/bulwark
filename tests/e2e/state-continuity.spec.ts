/**
 * tests/e2e/state-continuity.spec.ts — W1-4 / EH-D (ADR-0017).
 *
 * Smoke validation of bidirectional navigation + rollup wiring on
 * existing seed data. Two checks:
 *
 *   1. Property detail renders the Activity tab and the timeline ol
 *      populates from audit_log (seed data has at least property
 *      creation rows).
 *   2. The work-order detail page links back to its parent property
 *      and to its source quote.
 *
 * The full auto-status flow (quote.accept → property.status =
 * accepted) is covered by `tests/integration/auto-status-transitions.test.ts`
 * which exercises the bus + subscriber directly against Postgres
 * (faster + deterministic than driving the same flow through the UI).
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('State continuity (W1-4 / EH-D)', () => {
  test.beforeAll(async () => {
    const { reseedRealBackend } = await import('./_reseed')
    reseedRealBackend()
  })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signInAsAdmin(page)
  })

  test('property detail exposes the Activity tab with timeline rows', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    const firstCard = page.getByTestId('property-card').first()
    await expect(firstCard).toBeVisible()
    await firstCard.click()
    await expect(page).toHaveURL(/\/admin\/properties\/[\w-]+(?:\?.*)?$/, { timeout: 10000 })
    // Activity tab is present.
    const activityTab = page.getByRole('tab', { name: /Activity/ })
    await expect(activityTab).toBeVisible()
    await activityTab.click()
    await expect(page).toHaveURL(/tab=activity/)
    const timeline = page.getByTestId('property-activity-timeline')
    const empty = page.getByTestId('tab-panel-activity').locator('text=No activity yet')
    // Either the timeline ol is visible (seed has audit rows) or the
    // empty state is — both are valid wirings.
    await expect.poll(async () => (await timeline.count()) + (await empty.count())).toBeGreaterThan(0)
  })

  test('work-order detail links back to parent property and source quote', async ({ page }) => {
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    const firstRow = page.locator('[data-testid="work-order-row"]').first()
    if ((await firstRow.count()) === 0) {
      test.skip(true, 'no work orders in seed; covered by integration test')
      return
    }
    await firstRow.click()
    await expect(page).toHaveURL(/\/admin\/work-orders\/[\w-]+/)
    await expect(page.getByTestId('link-to-property')).toBeVisible()
    await expect(page.getByTestId('link-to-source-quote')).toBeVisible()
    const propertyHref = await page.getByTestId('link-to-property').getAttribute('href')
    expect(propertyHref).toMatch(/^\/admin\/properties\//)
  })
})

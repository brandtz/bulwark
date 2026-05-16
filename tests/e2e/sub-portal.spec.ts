/**
 * tests/e2e/sub-portal.spec.ts — W4-2 (deferred from W3-4 / EH-N /
 * ADR-0031).
 *
 * # What this spec covers
 *   - Seeds a `subcontractor_users` join row linking jeff@bulwark.demo
 *     to Roof King Co. (idempotent — re-running is safe).
 *   - jeff logs in via the standard mock-or-real signIn helper, lands
 *     on `/sub` (the portal home), sees the KPI tiles, and navigates
 *     to `/sub/work-orders`.
 *   - Asserts the assigned seed WO card is visible (`WO-2026-0001`
 *     assigns slot-roofing → sub-roof-king in db-seed.mjs).
 *
 * # Decisions (ADR-0007)
 *   - Real-backend only. The mock factory doesn't seed a
 *     subcontractor_users row for jeff, and stubbing one in the mock
 *     just to drive this spec is wasted scope. The contract+service
 *     are covered by unit tests; this spec proves the UI end-to-end.
 *   - "Completes a slot" portion of the brief is deliberately
 *     deferred: `/sub/work-orders/[id]` is not yet a page. Once it
 *     ships, replace the trailing `test.skip(...)` block with the
 *     real flow.
 */
import { test, expect } from '@playwright/test'
import { signIn } from './_helpers'
import { seedSubPortal, SUB_PORTAL_FIXTURE } from '../setup/seed-sub-portal'

test.describe('Sub portal landing + assigned WO (W4-2 / EH-N)', () => {
  test.beforeAll(async () => {
    test.skip(process.env.BULWARK_BACKEND !== 'real', 'real-backend only — needs subcontractor_users seed')
    await seedSubPortal()
  })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signIn(page.context(), SUB_PORTAL_FIXTURE.subUserEmail)
  })

  test('sub lands on /sub, sees KPIs, then sees the assigned WO card', async ({ page }) => {
    await page.goto('/sub')
    await expect(page.getByTestId('sub-home')).toBeVisible()
    await expect(page.getByTestId('sub-kpi-wos')).toBeVisible()
    await expect(page.getByTestId('sub-kpi-quotes')).toBeVisible()
    await expect(page.getByTestId('sub-kpi-cois')).toBeVisible()

    await page.goto('/sub/work-orders')
    await expect(page.getByTestId('sub-wos')).toBeVisible()
    const woCard = page.getByTestId(`sub-wo-${SUB_PORTAL_FIXTURE.workOrderId}`)
    await expect(woCard).toBeVisible()

    // "Click in and complete a slot" is deferred until the sub WO
    // detail page ships. The KPI + assignment surface is enough to
    // prove the join + tenant scoping work end-to-end.
    test.skip(
      true,
      'TODO: complete-a-slot path waits on /sub/work-orders/[id] detail page (deferred W3-4 follow-up).',
    )
  })
})

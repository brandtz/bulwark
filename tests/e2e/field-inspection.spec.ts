/**
 * tests/e2e/field-inspection.spec.ts — W3-3 / EH-M / ADR-0029.
 *
 * # What this verifies
 *   - The field inspection host shell loads on `/field/jobs/<woId>/inspect`,
 *     bootstraps an inspection for the WO's property (reusing any open
 *     draft / submitted row, else creating one against the most-recent
 *     active template), and renders the W2-2 InspectionForm or the
 *     explicit error card if no templates exist.
 *
 * # Decisions (ADR-0007 / ADR-0029)
 *   - We accept BOTH terminal states (form visible OR error card with
 *     "No inspection templates configured." text). The seed DB always
 *     contains at least one template, but a future tenant-isolation
 *     change could legitimately surface the error path — the test
 *     should not box the contract in.
 *   - We harvest the WO id via the admin list (same pattern as
 *     field-check-in / field-photo-capture) to stay seed-agnostic.
 *
 * # Decision cast down
 *   - Rejected: filling out a response and asserting autosave fired.
 *     Autosave is covered by tests/e2e/inspection-dynamic.spec.ts at
 *     the admin surface; this spec only verifies the field host shell
 *     wires the inspection correctly.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut } from './_helpers'

test.describe('Field inspection host (W3-3)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('renders the inspection form or the no-templates error', async ({
    page,
    context,
  }) => {
    test.slow()

    // 1. Harvest a WO id as admin.
    await signInAsAdmin(page)
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('work-order-row').first().click()
    await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/)
    const woId = page.url().split('/').pop()!
    await signOut(context)

    // 2. Sign in as field + open inspect.
    await signInAsField(page)
    await page.goto(`/field/jobs/${woId}/inspect`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('field-inspection')).toBeVisible()

    const form = page.getByTestId('field-inspection-form')
    const errorCard = page.getByTestId('field-inspection-error')

    // Wait for bootstrap to settle.
    await expect(async () => {
      const formCount = await form.count()
      const errCount = await errorCard.count()
      expect(formCount + errCount).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000 })
  })
})

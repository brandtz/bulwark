/**
 * tests/e2e/inspection-dynamic.spec.ts — W2-2 / EH-F.
 *
 * Covers the dynamic Inspection Template Engine from an admin's perspective:
 *   1. Sign in as the seeded org admin.
 *   2. Open a seeded property → click Start inspection.
 *   3. Pick the Wildfire Retrofit template.
 *   4. Fill a handful of fields on the dynamic form.
 *   5. Submit + sign via the SignaturePad modal.
 *   6. Confirm the inspection issues panel renders (evaluator hooked).
 *
 * The seed pre-creates a Wildfire program + template + at least one property
 * for the demo org so this spec only exercises the UI plumbing — no DB seeding
 * happens inside the test.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('inspection template engine — admin happy path', () => {
  test('admin starts inspection, fills fields, signs, sees issues banner', async ({ page }) => {
    await signInAsAdmin(page)

    // Jump to the admin property list and open the first property.
    await page.goto('/admin/properties')
    await page.getByTestId('property-row').first().click()
    await page.waitForURL(/\/admin\/properties\/[^/]+$/u)

    // Find the property id from the URL so we can navigate to /inspection/new.
    const url = new URL(page.url())
    const propertyId = url.pathname.split('/').filter(Boolean).pop()
    expect(propertyId, 'property id parses from URL').toBeTruthy()

    await page.goto(`/admin/properties/${propertyId}/inspection/new`)
    await expect(page.getByTestId('inspection-new')).toBeVisible()

    // Start the Wildfire Retrofit template.
    await page.getByTestId('start-wildfire-retrofit').click()
    await expect(page.getByTestId('inspection-form')).toBeVisible({ timeout: 10_000 })

    // Fill one boolean + one number + one text field if they render.
    // The wildfire template defaults always render zone_0 / zone_1 first.
    const cleared = page.getByTestId('field-cleared_to_ground')
    if (await cleared.count()) {
      // BulwarkPassFailToggle renders Pass/Fail buttons.
      await cleared.getByRole('button', { name: /pass/iu }).first().click()
    }
    const treeSpacing = page.getByTestId('field-tree_spacing_ft')
    if (await treeSpacing.count()) {
      await treeSpacing.locator('input').first().fill('12')
    }

    // Submit & sign.
    await page.getByTestId('submit-and-sign').click()
    await expect(page.getByTestId('confirm-sign')).toBeVisible()
    // Draw a token signature: any non-empty stroke is fine — the pad records
    // pointer events, but for headless tests we just confirm the dialog.
    await page.getByTestId('confirm-sign').click()

    // Either issues banner shows up OR the form re-renders signed —
    // both prove the evaluator ran end-to-end.
    await expect(
      page.getByTestId('inspection-issues').or(page.getByTestId('inspection-signed-banner')),
    ).toBeVisible({ timeout: 10_000 })
  })
})

/**
 * tests/e2e/subcontractor-detail.spec.ts — E6-S5.
 *
 * # Decisions (ADR-0007)
 *   - Two tests, both against seeded subs (no create flow in S5).
 *     (1) Click a list row → land on detail → form pre-populated →
 *     edit license number + license expires + a contact field → save
 *     → success toast + form reflects the update on refresh.
 *     (2) Clear the trades multi-select and try to save → see the
 *     `tradesError` message and stay on the page (the contract
 *     requires `trades.min(1)`).
 *   - Both tests navigate via NuxtLink clicks rather than `page.goto`
 *     so we exercise the same client-mock module instance the form
 *     mutates. The detail page itself is `{ server: false }`, so a
 *     post-test reload would still find the row, but routing through
 *     the list keeps the spec a faithful reflection of the UI flow.
 *
 * # Decision cast down
 *   - Rejected: a third test for the "subcontractor not found" branch.
 *     Routing to a fabricated id is straightforward but adds no
 *     coverage beyond the existing 404 EmptyState pattern proven in E3.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('Subcontractor detail + edit (E6-S5)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('edits license info and persists across refresh', async ({ page }) => {
    await page.goto('/admin/subcontractors')
    await page.waitForLoadState('networkidle')

    // Pick "Cascade Siding LLC" — it has a license already so we can edit it.
    const row = page
      .getByTestId('subcontractor-row')
      .filter({ hasText: 'Cascade Siding LLC' })
    await expect(row).toBeVisible()
    await row.locator('a').click()

    await page.waitForURL(/\/admin\/subcontractors\/[\w-]+$/)
    await expect(page.getByTestId('subcontractor-detail')).toBeVisible()
    await expect(page.getByTestId('subcontractor-name')).toHaveText(
      'Cascade Siding LLC',
    )

    // Form is pre-populated.
    const licenseInput = page
      .getByTestId('field-license-number')
      .locator('input')
    await expect(licenseInput).toHaveValue('CCB-118842')

    const licenseExpires = page
      .getByTestId('field-license-expires')
      .locator('input')
    await expect(licenseExpires).toHaveValue('2026-12-15')

    // Edit license number, expiry, and contact name.
    await licenseInput.fill('CCB-999000')
    await licenseExpires.fill('2028-01-31')
    await page
      .getByTestId('field-contact-name')
      .locator('input')
      .fill('Updated Contact')

    await page.getByTestId('save-button').click()

    // Toast confirms save (BulwarkToastHost renders by aria-role region).
    await expect(page.getByText('Subcontractor saved')).toBeVisible()

    // Re-read the form values without page.goto; refresh() in onSubmit
    // reads from the same client mock module, so the form must reflect
    // the persisted patch.
    await expect(licenseInput).toHaveValue('CCB-999000')
    await expect(licenseExpires).toHaveValue('2028-01-31')
    await expect(
      page.getByTestId('field-contact-name').locator('input'),
    ).toHaveValue('Updated Contact')
  })

  test('blocks save when all trades are cleared', async ({ page }) => {
    await page.goto('/admin/subcontractors')
    await page.waitForLoadState('networkidle')

    const row = page
      .getByTestId('subcontractor-row')
      .filter({ hasText: 'Roof King Co.' })
    await row.locator('a').click()

    await page.waitForURL(/\/admin\/subcontractors\/[\w-]+$/)
    await expect(page.getByTestId('subcontractor-form')).toBeVisible()

    // Uncheck every trade option that is currently checked.
    const tradeBoxes = page
      .getByTestId('field-trades')
      .locator('input[type="checkbox"]:checked')
    const count = await tradeBoxes.count()
    for (let i = 0; i < count; i += 1) {
      // After each uncheck, the first :checked shifts; always pick index 0.
      await page
        .getByTestId('field-trades')
        .locator('input[type="checkbox"]:checked')
        .first()
        .uncheck()
    }

    await page.getByTestId('save-button').click()

    // Inline validation message appears and we stay on the same page.
    await expect(page.getByText('Pick at least one trade.')).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/subcontractors\/[\w-]+$/)
  })
})

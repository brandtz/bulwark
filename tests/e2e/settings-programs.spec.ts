/**
 * tests/e2e/settings-programs.spec.ts — Wave 1A / EH-A admin UI.
 *
 * # Decisions (ADR-0007, ADR-0013)
 *   - Reseed the real backend once before this file so a known
 *     starting state (Wildfire Retrofit built-in only) is guaranteed.
 *     Other specs in the suite are independent of the program table
 *     so they're unaffected.
 *   - Test 1 (list) and Test 5 (built-in is undeletable) cover the
 *     baseline. Tests 2/3/4 walk the create → rename → deactivate arc
 *     on a single custom program in sequence — chaining is cheaper
 *     than re-seeding between tests and the assertions don't share
 *     mutable state beyond "the row exists".
 *   - Test 6 covers role gating: field role MUST hit /403 rather than
 *     a blank screen, which is what the role middleware guarantees
 *     for any admin-only settings page.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut } from './_helpers'
import { reseedRealBackend } from './_reseed'

test.describe('Settings → Programs (Wave 1A / EH-A)', () => {
  test.beforeAll(async () => {
    await reseedRealBackend()
  })

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('admin lists the built-in Wildfire Retrofit program', async ({ page }) => {
    await page.goto('/settings/programs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-programs')).toBeVisible()

    const row = page.getByTestId('program-row').filter({ hasText: 'Wildfire Retrofit' })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('program-builtin-badge')).toBeVisible()
    await expect(row.getByTestId('program-active-badge')).toBeVisible()
    // No delete affordance on a built-in.
    await expect(row.getByTestId('program-delete-wildfire-retrofit')).toHaveCount(0)
  })

  test('admin creates a custom service program', async ({ page }) => {
    await page.goto('/settings/programs')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('programs-new-button').click()
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    await modal.getByTestId('program-form-name').locator('input').fill('Roof Replacement')
    // Tab out triggers autoSlug.
    await modal.getByTestId('program-form-name').locator('input').blur()
    await modal.getByTestId('program-form-slug').locator('input').fill('roof-replacement')
    await modal.getByTestId('program-form-kind').locator('select').selectOption('service_program')
    await modal.getByTestId('program-form-save').click()

    const row = page.getByTestId('program-row').filter({ hasText: 'Roof Replacement' })
    await expect(row).toHaveCount(1)
    await expect(row.getByText('Custom')).toBeVisible()
  })

  test('admin renames the custom program', async ({ page }) => {
    await page.goto('/settings/programs')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('program-edit-roof-replacement').click()
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    const nameInput = modal.getByTestId('program-form-name').locator('input')
    await nameInput.fill('Roof Replacement Pro')
    await modal.getByTestId('program-form-save').click()

    await expect(
      page.getByTestId('program-row').filter({ hasText: 'Roof Replacement Pro' }),
    ).toHaveCount(1)
  })

  test('admin deactivates the custom program', async ({ page }) => {
    await page.goto('/settings/programs')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('program-edit-roof-replacement').click()
    const modal = page.getByRole('dialog')
    await modal.getByTestId('program-form-active').click()
    await modal.getByTestId('program-form-save').click()

    const row = page.getByTestId('program-row').filter({ hasText: 'Roof Replacement Pro' })
    await expect(row.getByTestId('program-inactive-badge')).toBeVisible()
  })

  test('field role cannot reach /settings/programs', async ({ page, context }) => {
    await signOut(context)
    await signInAsField(page)
    await page.goto('/settings/programs')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/403/)
  })
})

/**
 * tests/e2e/settings-labels.spec.ts — Wave 1A / EH-B admin UI.
 *
 * # Decisions (ADR-0007, ADR-0014)
 *   - Reseed the real backend once before this file so the labels and
 *     org_branding tables start clean — overrides created in earlier
 *     specs (none today, but defense in depth) cannot leak in.
 *   - Pilot-surface assertion: an admin renames the property `lead`
 *     status to `Prospect`. We then navigate to /admin/properties (the
 *     pipeline list) and assert the badge for any lead-status property
 *     reads `Prospect`. This proves the composable + StatusBadge wiring
 *     reach the table at runtime.
 *   - Reset arc: after un-doing the override the badge reverts to the
 *     default copy. This is the user-facing "undo" admins expect.
 *   - Role gating: a field persona hitting /settings/labels must land
 *     at /403, matching every other admin-only settings page.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut } from './_helpers'
import { reseedRealBackend } from './_reseed'

test.describe('Settings → Labels (Wave 1A / EH-B)', () => {
  test.beforeAll(async () => {
    await reseedRealBackend()
  })

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('admin renames the property "lead" status and the pipeline reflects it', async ({ page }) => {
    await page.goto('/settings/labels')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-labels')).toBeVisible()

    // Statuses tab is the default. Find the row for status.property.lead.
    const leadRow = page
      .getByTestId('labels-row')
      .filter({ has: page.locator('[data-namespace="status.property"][data-key="lead"]') })
      .first()
    // Fallback selector if data attrs above don't match the rendered row.
    const row = (await leadRow.count())
      ? leadRow
      : page.getByTestId('labels-row').filter({ hasText: 'status.property.lead' }).first()
    await expect(row).toBeVisible()

    const input = row.getByTestId('labels-override-input')
    await input.fill('Prospect')
    await page.getByTestId('labels-save-all-button').click()

    // Wait for the save toast + the dirty count to clear.
    await expect(page.getByTestId('labels-save-all-button')).toContainText(/Save\s+all/i, { timeout: 10000 })

    // Navigate to the pipeline list and confirm the badge picked up the new copy.
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    const badges = page.getByTestId('status-badge').filter({ hasText: 'Prospect' })
    await expect.poll(async () => await badges.count(), { timeout: 10000 }).toBeGreaterThan(0)

    // Reset arc: remove the override.
    await page.goto('/settings/labels')
    await page.waitForLoadState('networkidle')
    const rowAfter = page
      .getByTestId('labels-row')
      .filter({ hasText: 'status.property.lead' })
      .first()
    await rowAfter.getByTestId('labels-reset-button').click()
    await page.waitForLoadState('networkidle')

    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    const defaultBadges = page.getByTestId('status-badge').filter({ hasText: 'Lead' })
    await expect.poll(async () => await defaultBadges.count(), { timeout: 10000 }).toBeGreaterThan(0)
  })

  test('field persona is denied /settings/labels', async ({ page, context }) => {
    await signOut(context)
    await signInAsField(page)
    await page.goto('/settings/labels')
    await expect(page).toHaveURL(/\/403/)
  })

  test('admin saves branding without errors', async ({ page }) => {
    await page.goto('/settings/branding')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-branding')).toBeVisible()

    await page.getByTestId('branding-footer-text').locator('textarea').fill('Bulwark Demo — License #C-12345')
    await page.getByTestId('branding-save-button').click()
    await expect(page.getByTestId('branding-error')).toHaveCount(0)
  })
})

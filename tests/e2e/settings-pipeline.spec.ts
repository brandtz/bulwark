/**
 * tests/e2e/settings-pipeline.spec.ts — Wave 1B / EH-H / W1-3 admin UI.
 *
 * Verifies that an org_admin can load the Status pipelines editor,
 * see the default Property pipeline pre-seeded, add a status, save,
 * and that the version bumps from v1 to v2. Role gating asserted.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut } from './_helpers'
import { reseedRealBackend } from './_reseed'

test.describe('Settings → Status pipelines (Wave 1B / EH-H / W1-3)', () => {
  test.beforeAll(async () => {
    await reseedRealBackend()
  })

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('admin loads the default Property pipeline (v1, all default nodes)', async ({ page }) => {
    await page.goto('/settings/pipelines')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-pipelines')).toBeVisible()
    // The bootstrap call should pre-load Property's default nodes.
    const rows = page.getByTestId('pipeline-node-row')
    await expect(rows.first()).toBeVisible()
    await expect(page.getByText(/Current version:/)).toContainText('v1')
  })

  test('admin adds a status, saves, and version bumps to v2', async ({ page }) => {
    await page.goto('/settings/pipelines')
    await page.waitForLoadState('networkidle')
    // Switch to the Job pipeline — fewer nodes makes the assertion clearer.
    await page.getByTestId('pipeline-entity-select').locator('select').selectOption('job')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/Current version:/)).toContainText('v1')

    await page.getByTestId('pipeline-add-node').click()
    await page.getByTestId('pipeline-save').click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Current version:/)).toContainText('v2')
  })

  test('field role cannot reach /settings/pipelines', async ({ page, context }) => {
    await signOut(context)
    await signInAsField(page)
    await page.goto('/settings/pipelines')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/403/)
  })
})

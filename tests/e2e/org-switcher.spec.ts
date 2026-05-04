/**
 * tests/e2e/org-switcher.spec.ts — multi-org switcher (E2-S4).
 *
 * # Decisions (ADR-0007)
 *
 * - **Drives the super_admin fixture** (sasha@bulwark.platform) which is
 *   the only persona with memberships in two orgs.
 * - **Asserts both UI surfaces**: the topbar widget link AND the
 *   `/org-switcher` page row click.
 * - **Verifies persistence across reloads**: a hard reload should keep
 *   the picked org active (cookie-backed).
 *
 * # Decision cast down
 *
 * - **Mocking a fake third org per test**. Rejected — the two fixtures
 *   are stable and shared across every spec, which makes flakes easier
 *   to diagnose.
 */
import { test, expect } from '@playwright/test'
import { signIn, signOut } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Org switcher — multi-org persona', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signOut(page.context())
  })

  test('single-org user sees a non-link chip and the page singleton notice', async ({ page }) => {
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/admin/dashboard')
    await expect(page.getByTestId('org-switcher')).toBeVisible()
    // Single-org chip is a <div> (no NuxtLink). The element should not
    // navigate when clicked.
    await page.getByTestId('org-switcher').click()
    await expect(page).toHaveURL(/\/admin\/dashboard$/)
    // The page itself still loads and shows a friendly notice.
    await page.goto('/org-switcher')
    await expect(page.getByTestId('org-singleton-notice')).toBeVisible()
  })

  test('super_admin can pick a second org and the cookie persists', async ({ page }) => {
    await signIn(page.context(), 'sasha@bulwark.platform')
    await page.goto('/admin/dashboard')
    await expect(page.getByTestId('org-switcher')).toBeVisible()
    // Topbar widget should be a link for multi-org users.
    await page.getByTestId('org-switcher').click()
    await expect(page).toHaveURL(/\/org-switcher$/)
    await page.waitForLoadState('networkidle')
    // Two org rows visible.
    const rows = page.getByTestId('org-list').locator('button')
    await expect(rows).toHaveCount(2)
    // The currently-active row carries the badge.
    await expect(page.getByTestId('org-active-badge')).toBeVisible()
    // Pick the OTHER org (Acme).
    await page.getByRole('button', { name: /Acme Restoration LLC/ }).click()
    // Lands somewhere signed-in (role-aware redirect via /).
    await page.waitForURL(/\/(admin|field|sub)\/dashboard$/, { timeout: 15000 })
    // Topbar reflects the new org.
    await expect(page.getByTestId('org-switcher')).toContainText('Acme Restoration LLC')
    // Hard reload keeps it active.
    await page.reload()
    await expect(page.getByTestId('org-switcher')).toContainText('Acme Restoration LLC')
  })
})

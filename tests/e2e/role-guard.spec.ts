/**
 * tests/e2e/role-guard.spec.ts — role-based middleware + /403 page (E2-S3).
 *
 * # Decisions (ADR-0007)
 *
 * - **One spec per UI story.** This file is the entire surface for E2-S3.
 *   It exercises:
 *     1. Field user hitting /admin/dashboard is bounced to /403.
 *     2. Sub user hitting /admin/properties is bounced to /403.
 *     3. Admin user can reach /admin/dashboard normally.
 *     4. Anonymous user hitting /403 sees the "you must sign in" copy.
 *     5. The 403 page's "Go to my dashboard" button does the role-aware
 *        redirect via `/`.
 *
 * # Decision cast down
 *
 * - **Just unit-test `usePermissions`**. Rejected: the tight loop is
 *   middleware → meta → page render → middleware again. A unit test
 *   leaves the integration risk uncovered. Browser test catches the real
 *   wiring problems (e.g. forgetting to add `'role'` to `middleware`).
 */
import { test, expect } from '@playwright/test'
import { signIn, signOut } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Role guard — admin pages reject non-admin personas', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signOut(page.context())
  })

  test('field worker hitting /admin/dashboard lands on /403', async ({ page }) => {
    await signIn(page.context(), 'matthew@bulwark.demo')
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/403$/)
    await expect(page.getByTestId('forbidden-card')).toBeVisible()
    await expect(page.getByTestId('forbidden-card')).toContainText('field')
  })

  test('subcontractor hitting /admin/properties lands on /403', async ({ page }) => {
    await signIn(page.context(), 'jeff@bulwark.demo')
    await page.goto('/admin/properties')
    await expect(page).toHaveURL(/\/403$/)
    await expect(page.getByTestId('forbidden-card')).toBeVisible()
  })

  test('org admin reaches /admin/dashboard with the persistent shell', async ({ page }) => {
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/admin\/dashboard$/)
    await expect(page.getByTestId('user-menu-button')).toBeVisible()
  })

  test('anonymous visit to /403 shows the sign-in copy', async ({ page }) => {
    await page.goto('/403')
    await expect(page.getByTestId('forbidden-card')).toContainText('sign in')
  })

  test('home button on /403 redirects role-aware', async ({ page }) => {
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/403')
    await page.getByTestId('home-button').click()
    await expect(page).toHaveURL(/\/admin\/dashboard$/)
  })
})

/**
 * tests/e2e/auth.spec.ts — login form + middleware redirects (E2-S1).
 *
 * Why these tests
 * ---------------
 * - Verify auth.global.ts redirects unauthed traffic to /login (and preserves
 *   ?next=).
 * - Verify the form submits, populates session, and lands on the intended page.
 * - Verify the dev persona shortcut flips the session to a different user.
 * - Verify Sign Out clears the session and bounces back to /login.
 *
 * Project scope: chromium-only. Mobile auth UX is identical (form is
 * `max-w-sm` centred) and would only duplicate runtime.
 */
import { test, expect } from '@playwright/test'
import { signIn, signOut } from './_helpers'

test.describe('Auth — login form + middleware', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only')
    // Each test asserts a specific signed-in / signed-out state, so wipe the
    // persona cookie up front and let the test set what it needs.
    await signOut(page.context())
  })

  test('signed-out user hitting protected route is redirected to /login with ?next=', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)admin(%2F|\/)dashboard/)
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('persona quick-pick logs in and lands on admin dashboard', async ({ page }) => {
    await page.goto('/login?next=%2Fadmin%2Fdashboard')
    await page.getByRole('button', { name: /Org admin/ }).click()
    await expect(page).toHaveURL('/admin/dashboard')
    await expect(page.getByTestId('user-menu').getByText('Drew Owens')).toBeVisible()
  })

  test('manual form submit with field-worker email signs in and ?next= is honoured', async ({ page }) => {
    await page.goto('/login?next=%2Fadmin%2Fproperties')
    await page.getByLabel('Email').fill('matthew@bulwark.demo')
    await page.getByLabel('Password').fill('whatever')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/admin/properties')
  })

  test('Sign Out from topbar clears session and bounces to /login', async ({ page }) => {
    // Pre-seed an admin session for this test.
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('logout-button').click()
    await expect(page).toHaveURL(/\/login/)
    // After logout, hitting a protected route bounces again.
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})

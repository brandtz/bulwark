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
import { isBuiltServer, signIn, signOut } from './_helpers'

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
    // The quick-pick is compiled only into dev builds (login.vue: import.meta.dev).
    test.skip(isBuiltServer(), 'dev-only persona quick-pick')
    await page.goto('/login?next=%2Fadmin%2Fdashboard')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /Org admin/ }).click()
    await expect(page).toHaveURL('/admin/dashboard')
    await expect(page.getByTestId('user-menu-button').getByText('Drew Owens')).toBeVisible()
  })

  test('manual form submit with admin email signs in and ?next= is honoured', async ({ page }) => {
    await page.goto('/login?next=%2Fadmin%2Fproperties')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('remember-me-checkbox')).not.toBeChecked()
    await page.getByTestId('remember-me-checkbox').check()
    await page.getByLabel('Email').fill('drew@bulwark.demo')
    await page
      .getByLabel(/^Password\*?$/)
      .fill(process.env.BULWARK_BACKEND === 'real' ? 'BulwarkDemo!1' : 'whatever')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL('/admin/properties', { timeout: 15_000 })
  })

  test('Keep me signed in sets a 30-day cookie that survives later session writes; unchecked stays a browser-session cookie', async ({ browser }) => {
    test.skip(process.env.BULWARK_BACKEND !== 'real', 'session cookies are issued by the real backend')
    const sessionCookie = async (context: import('@playwright/test').BrowserContext) =>
      (await context.cookies('http://localhost:3000')).find((c) => c.name === 'nuxt-session')
    const login = (context: import('@playwright/test').BrowserContext, rememberMe: boolean) =>
      context.request.post('http://localhost:3000/api/services/auth/login', {
        data: { args: [{ email: 'drew@bulwark.demo', password: 'BulwarkDemo!1', rememberMe }] },
      })

    const persistent = await browser.newContext()
    const transient = await browser.newContext()
    try {
      expect((await login(persistent, true)).ok()).toBe(true)
      const days = ((await sessionCookie(persistent))!.expires - Date.now() / 1000) / 86_400
      expect(days).toBeGreaterThan(29.9)
      expect(days).toBeLessThanOrEqual(30)

      // A later write (org switch) re-seals the cookie and must keep the same lifetime.
      const me = await (await persistent.request.post('http://localhost:3000/api/services/auth/currentUser', { data: { args: [] } })).json()
      const switched = await persistent.request.post('http://localhost:3000/api/services/auth/switchActiveOrg', {
        data: { args: [me.activeOrganizationId] },
      })
      expect(switched.ok()).toBe(true)
      expect(((await sessionCookie(persistent))!.expires - Date.now() / 1000) / 86_400).toBeGreaterThan(29.9)

      expect((await login(transient, false)).ok()).toBe(true)
      expect((await sessionCookie(transient))!.expires).toBe(-1)
    } finally {
      await persistent.close()
      await transient.close()
    }
  })

  test('Sign Out from topbar clears session and bounces to /login', async ({ page }) => {
    // Pre-seed an admin session for this test.
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('user-menu-button').click()
    await page.getByTestId('logout-button').click()
    await expect(page).toHaveURL(/\/login/)
    // After logout, hitting a protected route bounces again.
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})

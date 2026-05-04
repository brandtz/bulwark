/**
 * tests/e2e/user-menu.spec.ts — UserMenu dropdown (E2-S5).
 *
 * Covers click-to-toggle, escape-to-close, the "Switch organization"
 * entry visibility rule, and Sign-out from the menu.
 */
import { test, expect } from '@playwright/test'
import { signIn, signOut } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('UserMenu — top-bar dropdown', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signOut(page.context())
  })

  test('panel opens and shows Sign out', async ({ page }) => {
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('user-menu-button')).toBeVisible()
    await expect(page.getByTestId('user-menu-panel')).toHaveCount(0)
    await page.getByTestId('user-menu-button').click()
    await expect(page.getByTestId('user-menu-button')).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 })
    await expect(page.getByTestId('user-menu-panel')).toBeVisible()
    await expect(page.getByTestId('logout-button')).toBeVisible()
  })

  test('Escape closes the panel', async ({ page }) => {
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('user-menu-button').click()
    await expect(page.getByTestId('user-menu-button')).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 })
    await expect(page.getByTestId('user-menu-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('user-menu-panel')).toHaveCount(0)
  })

  test('panel hides Switch-organization for single-org users', async ({ page }) => {
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('user-menu-button').click()
    await expect(page.getByTestId('user-menu-button')).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 })
    await expect(page.getByTestId('user-menu-panel')).toBeVisible()
    await expect(page.getByTestId('user-menu-switch-org')).toHaveCount(0)
  })

  test('panel shows Switch-organization for multi-org users', async ({ page }) => {
    await signIn(page.context(), 'sasha@bulwark.platform')
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('user-menu-button').click()
    await expect(page.getByTestId('user-menu-button')).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 })
    await expect(page.getByTestId('user-menu-switch-org')).toBeVisible()
    await page.getByTestId('user-menu-switch-org').click()
    await expect(page).toHaveURL(/\/org-switcher$/)
  })

  test('Sign out from menu clears session and bounces to /login', async ({ page }) => {
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('user-menu-button').click()
    await expect(page.getByTestId('user-menu-button')).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 })
    await page.getByTestId('logout-button').click()
    await expect(page).toHaveURL(/\/login/)
  })
})

/**
 * smoke.spec.ts — Bulwark scaffold sanity check.
 *
 * The mock plugin no longer auto-signs anyone in (E2-S1) — the cookie-backed
 * adapter starts empty. Tests that need a signed-in shell call
 * `signInAsAdmin()` in beforeEach. The auth flow itself is covered by
 * auth.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('Scaffold smoke', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('root URL redirects to admin dashboard', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/admin\/dashboard$/)
    await expect(page.getByText('Welcome back')).toBeVisible()
  })

  test('admin dashboard renders status pills from fixtures', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page.locator('[data-status]').first()).toBeVisible()
  })
})

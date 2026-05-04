/**
 * smoke.spec.ts — Bulwark scaffold sanity check.
 *
 * The mock plugin defaults to FIXTURE_USER_ADMIN; the index page redirects
 * by role; the admin dashboard renders pipeline-grouped properties.
 * Shell invariants are covered in nav-shell.spec.ts.
 */
import { test, expect } from '@playwright/test'

test.describe('Scaffold smoke', () => {
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

/**
 * tests/e2e/error-pages.spec.ts — E2-S6 (404 + 500 styled error pages).
 *
 * Covers the unmatched-route 404 path and a deterministic 500 path
 * via /dev/throw. /403 is exercised separately by role-guard.spec.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Error pages — chromium', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only')
    await signInAsAdmin(page)
  })

  test('unmatched route renders the styled 404 card', async ({ page }) => {
    const r = await page.goto('/totally-bogus-path-xyz')
    expect(r?.status()).toBe(404)
    await expect(page.getByTestId('not-found-card')).toBeVisible()
    await expect(page.getByTestId('home-button')).toBeVisible()
    await expect(page.getByTestId('back-button')).toBeVisible()
  })

  test('home button on 404 returns to a signed-in dashboard', async ({ page }) => {
    await page.goto('/totally-bogus-path-xyz')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('home-button').click()
    await page.waitForURL(/\/(admin|field|sub)\/dashboard$/, { timeout: 15000 })
  })

  test('thrown error renders the styled 500 card', async ({ page }) => {
    const r = await page.goto('/dev/throw')
    expect(r?.status()).toBe(500)
    await expect(page.getByTestId('server-error-card')).toBeVisible()
    await expect(page.getByTestId('home-button')).toBeVisible()
  })
})

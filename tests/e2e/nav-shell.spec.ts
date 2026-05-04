/**
 * tests/e2e/nav-shell.spec.ts — verifies ADR-0005 invariants.
 *
 * The persistent app shell must:
 *   - render a sidebar on desktop
 *   - render a bottom nav on mobile (and NOT the sidebar)
 *   - place the user chip in the top bar on every authenticated route
 *   - persist across client-side navigations
 *
 * If any of these fail we've regressed the demo-era inconsistencies the
 * single-AppLayout decision exists to prevent.
 *
 * Project-aware split: the "desktop" assertions only run on the desktop
 * Chromium project; mobile assertions only run on mobile-safari/pixel.
 */
import { test, expect } from '@playwright/test'

test.describe('Persistent app shell — desktop', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only')
  })

  test('renders sidebar + topbar on the dashboard', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeVisible()
    await expect(page.getByTestId('user-menu')).toBeVisible()
    await expect(page.getByText('Welcome back')).toBeVisible()
  })

  test('navigating between admin routes preserves the shell', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeVisible()
    await page.goto('/admin/properties')
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeVisible()
    await expect(page.getByTestId('user-menu')).toBeVisible()
  })
})

test.describe('Persistent app shell — mobile', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name === 'chromium', 'mobile-only')
  })

  test('renders bottom nav and hides desktop sidebar', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page.getByRole('navigation', { name: 'Mobile primary' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeHidden()
  })
})

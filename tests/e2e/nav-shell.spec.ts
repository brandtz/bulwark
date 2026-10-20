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
import { signInAsAdmin, signInAsField, waitForHydration } from './_helpers'

test.describe('Persistent app shell — desktop', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only')
    await signInAsAdmin(page)
  })
  test('renders sidebar + topbar + skip link on the dashboard', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await waitForHydration(page)
    await expect(page.getByTestId('skip-to-content')).toBeAttached()
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeVisible()
    await expect(page.getByTestId('user-menu-button')).toBeVisible()
    await expect(page.getByText('Welcome back')).toBeVisible()
  })

  test('sidebar collapse toggle collapses to 64px, keeps items accessible with tooltips, and persists across reload', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await waitForHydration(page)
    const sidebar = page.getByTestId('app-sidebar')
    const toggle = page.getByTestId('sidebar-collapse-toggle')
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await toggle.click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    const propertiesLink = sidebar.getByRole('link', { name: 'Properties' })
    await expect(propertiesLink).toHaveAttribute('title', 'Properties')

    await page.reload()
    await waitForHydration(page)
    await expect(page.getByTestId('app-sidebar')).toHaveAttribute('data-collapsed', 'true')

    // Restore expanded state
    await page.getByTestId('sidebar-collapse-toggle').click()
    await expect(page.getByTestId('app-sidebar')).toHaveAttribute('data-collapsed', 'false')
  })

  test('navigating between admin routes preserves the shell', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await waitForHydration(page)
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeVisible()
    await page.goto('/admin/properties')
    await waitForHydration(page)
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeVisible()
    await expect(page.getByTestId('user-menu-button')).toBeVisible()
  })
})

test.describe('Persistent app shell — mobile', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium', 'mobile-only')
    await signInAsAdmin(page)
  })

  test('renders bottom nav (≤5 items), opens SH-10 More sheet, and hides desktop sidebar', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await waitForHydration(page)
    const bottomNav = page.getByRole('navigation', { name: 'Mobile primary' })
    await expect(bottomNav).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeHidden()

    const tabCount = await bottomNav.locator('a, button').count()
    expect(tabCount).toBeLessThanOrEqual(5)

    await page.getByTestId('mobile-more-button').click()
    await expect(page.getByTestId('mobile-more-sheet')).toBeVisible()
    await expect(page.getByTestId('more-sheet-sign-out')).toBeVisible()
  })
})

test('field routes consistently use the field shell', async ({ page }) => {
  test.setTimeout(90_000)
  await signInAsField(page)

  for (const route of [
    '/field',
    '/field/dashboard',
    '/field/properties',
    '/field/work-orders',
    '/field/sync-queue',
    '/field/check-in',
    '/field/assessments',
  ]) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await waitForHydration(page)
    await expect(page.getByTestId('field-layout'), route).toBeVisible()
  }
})

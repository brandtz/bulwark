/**
 * SH-00 — App shells (Packet A).
 * Source design: agents/design/return/design-return/A/shell/INDEX.html
 */
import { test, expect } from '@playwright/test'
import { describeScreen } from './_contract'

const route = '/admin/dashboard'

describeScreen({
  id: 'SH-00',
  route,
  roles: ['org_admin'],
  viewports: ['desktop', 'mobile'],
  testIds: ['app-sidebar', 'mobile-bottom-nav'],
}, () => {
  test('admin shell exposes skip, primary navigation and hides More at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(route, { waitUntil: 'domcontentloaded' })

    const sidebar = page.getByTestId('app-sidebar')
    await expect(sidebar).toBeVisible()
    await expect(page.getByTestId('skip-to-content')).toBeAttached()
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(sidebar.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    await expect(page.getByTestId('mobile-bottom-nav')).toBeHidden()
    await expect(page.getByRole('alertdialog', { name: 'Unsynced work' })).toHaveCount(0)
  })
})

/**
 * smoke.spec.ts — Bulwark E0 sanity check
 *
 * Verifies the scaffold renders. Replaced/extended in E1+ as real screens
 * land. Run via `pnpm test:e2e`.
 */
import { test, expect } from '@playwright/test'

test.describe('E0 scaffold smoke', () => {
  test('home page renders the Bulwark wordmark', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Bulwark')).toBeVisible()
  })

  test('home page lists the four portal homes', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Admin / Owner')).toBeVisible()
    await expect(page.getByText('Field / GC')).toBeVisible()
    await expect(page.getByText('Subcontractor')).toBeVisible()
    await expect(page.getByText('Homeowner')).toBeVisible()
  })
})

/**
 * tests/e2e/dashboard.spec.ts — W4-2 (deferred from W3-2 / EH-K / ADR-0030).
 *
 * # What this spec covers
 *   - Admin signs in and lands at `/admin`.
 *   - The KPI grid renders 8 cards, each with numeric content.
 *   - The three chart surfaces (donut x2, bar, sparkline) render SVGs.
 *   - The date-range picker is wired: clicking a different range
 *     updates the visible selection AND at least one KPI's rendered
 *     value changes (covers the dashboardKpis re-fetch + delta math).
 *
 * # Decisions (ADR-0007)
 *   - Chromium-only. The dashboard is a desktop-first surface — the
 *     mobile layout reuses the same data plumbing, so per-device
 *     re-verification is wasted machine time.
 *   - The "value changes" assertion uses `expect.poll` over multiple
 *     KPIs because static seed data can produce identical values for
 *     adjacent windows. Asserting one card changes between 7d and
 *     90d (revenue + AR aging respond to range span) is enough to
 *     prove the picker wiring.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

const KPI_KEYS = [
  'open-quotes',
  'open-quotes-value',
  'accepted-quotes-value',
  'scheduled-wos',
  'overdue-invoices',
  'overdue-invoices-value',
  'paid-this-month',
  'compliance-this-month',
] as const

async function snapshotKpis(page: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const k of KPI_KEYS) {
    out[k] = (await page.getByTestId(`kpi-${k}`).innerText()).trim()
  }
  return out
}

test.describe('Admin dashboard (W4-2 / EH-K)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signInAsAdmin(page)
  })

  test('admin lands on the KPI dashboard with charts and a working range picker', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByTestId('admin-dashboard')).toBeVisible()
    await page.waitForLoadState('networkidle')

    // KPI grid: 8 cards, each with numeric content.
    const grid = page.getByTestId('dashboard-kpi-grid')
    await expect(grid).toBeVisible()
    for (const k of KPI_KEYS) {
      const card = page.getByTestId(`kpi-${k}`)
      await expect(card).toBeVisible()
      await expect(card).toHaveText(/\d/)
    }

    // Charts: donut x2 (quotes + wos), bar (AR aging), sparkline (revenue).
    await expect(page.getByTestId('dashboard-quotes-by-status').locator('svg').first()).toBeVisible()
    await expect(page.getByTestId('dashboard-wos-by-priority').locator('svg').first()).toBeVisible()
    await expect(page.getByTestId('dashboard-ar-aging').locator('svg').first()).toBeVisible()
    await expect(page.getByTestId('dashboard-revenue-trend').locator('svg').first()).toBeVisible()

    // Range picker wiring: default is 30d. Switch to 7d, then to 90d
    // (90d will include the seed quotes/invoices that 7d excludes).
    await expect(page.getByTestId('range-30d')).toHaveClass(/bg-primary/)
    const before = await snapshotKpis(page)
    await page.getByTestId('range-90d').click()
    await expect(page.getByTestId('range-90d')).toHaveClass(/bg-primary/)
    await expect.poll(async () => {
      const now = await snapshotKpis(page)
      return KPI_KEYS.some((k) => now[k] !== before[k])
    }, { timeout: 10_000 }).toBe(true)
  })
})

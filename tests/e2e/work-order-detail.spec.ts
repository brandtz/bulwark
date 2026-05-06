/**
 * tests/e2e/work-order-detail.spec.ts — E6-S1.
 *
 * # Decisions (ADR-0007)
 *   - Three tests. (1) Sidebar link reaches the work-orders list and
 *     the seed fixture row is visible. (2) Click-through from list
 *     to detail renders the WO number, status pill, and at least two
 *     trade slots with status pills. (3) Subcontractors sidebar link
 *     reaches the subs list with the seed companies visible.
 *   - List + detail pages both use `useAsyncData(\u2026, { server: false })`,
 *     so navigation must be client-side (NuxtLink clicks). We allow a
 *     single `page.goto` to enter the admin shell at the start of each
 *     test \u2014 these are read-only flows, no mutation \u2192 no SSR/CSR
 *     divergence risk.
 *   - We don't test status-filter logic at S1 \u2014 the filter UI ships
 *     with the page, but creating non-default-status WOs requires the
 *     create-from-quote flow that lands in E6-S2.
 *
 * # Decision cast down
 *   - Rejected: testing trade-slot details exhaustively. The seed
 *     fixture is informational; verifying the rendering contract
 *     (number, status, slot count) is sufficient. Per-trade interaction
 *     gets tests in E6-S3 / E6-S4.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('Work order detail (E6-S1)', () => {
  test.beforeAll(async () => {
    // Real-backend mode: prior specs (work-order-create, -assign, -progress)
    // leave detritus that breaks the trade-slot count assertion.
    const { reseedRealBackend } = await import('./_reseed')
    reseedRealBackend()
  })

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('seed work order appears in the list', async ({ page }) => {
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('work-orders-list')).toBeVisible()

    const row = page.getByTestId('work-order-row').first()
    await expect(row).toBeVisible()
    await expect(row.getByTestId('work-order-row-number')).toHaveText(/WO-\d{4}-\d{4}/)
    await expect(row.getByTestId('work-order-row-status')).toBeVisible()
  })

  test('clicking a row opens the detail page with trades and status', async ({
    page,
  }) => {
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    const row = page.getByTestId('work-order-row').first()
    await expect(row).toBeVisible()
    await row.click()

    await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/)
    await expect(page.getByTestId('work-order-detail')).toBeVisible()
    await expect(page.getByTestId('work-order-number')).toHaveText(/WO-\d{4}-\d{4}/)

    const status = page.getByTestId('work-order-status')
    await expect(status).toBeVisible()
    await expect(status).toHaveAttribute('data-status', /draft|scheduled|in_progress|completed|cancelled/)

    const slots = page.getByTestId('trade-slot')
    await expect(slots.first()).toBeVisible()
    expect(await slots.count()).toBeGreaterThanOrEqual(2)

    // Each slot has a status pill with a data-status attribute.
    const firstSlotStatus = slots.first().getByTestId('trade-slot-status')
    await expect(firstSlotStatus).toBeVisible()
    await expect(firstSlotStatus).toHaveAttribute(
      'data-status',
      /unassigned|assigned|in_progress|completed|blocked/,
    )
  })

  test('subcontractors page lists seed companies', async ({ page }) => {
    await page.goto('/admin/subcontractors')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('subcontractors-list')).toBeVisible()
    const rows = page.getByTestId('subcontractor-row')
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeGreaterThanOrEqual(2)
  })
})

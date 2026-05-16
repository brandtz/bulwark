/**
 * tests/e2e/reports-csv.spec.ts — W4-2 (deferred from W3-2 / EH-K /
 * ADR-0030).
 *
 * # What this spec covers
 *   - Admin opens `/admin/reports`, navigates into the AR aging report,
 *     clicks "Export CSV", and asserts the browser fires a real
 *     download event with a `.csv` filename.
 *   - The downloaded payload's first row is the expected CSV header.
 *
 * # Decisions (ADR-0007 / ADR-0030)
 *   - `useCsvExport()` creates an `<a download="...">` element + a
 *     blob URL, then clicks. Playwright surfaces this via
 *     `page.waitForEvent('download')` because the synthetic click
 *     navigates the blob URL with a `download` attribute set.
 *   - We pick AR aging because its row source is the invoices table
 *     (seed-deterministic) and its CSV header is fixed at the
 *     report-config level (`bucket, count, balance_cents`).
 */
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { signInAsAdmin } from './_helpers'

test.describe('Admin reports CSV export (W4-2 / EH-K)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signInAsAdmin(page)
  })

  test('admin exports AR aging as CSV with the expected header row', async ({ page }) => {
    await page.goto('/admin/reports')
    await page.waitForLoadState('networkidle')

    // Reports landing grid is a static set of links; click straight
    // into ar-aging by URL to keep the spec resilient to layout polish.
    await page.goto('/admin/reports/ar-aging')
    await expect(page.getByTestId('admin-report-ar-aging')).toBeVisible()
    await page.waitForLoadState('networkidle')

    const exportButton = page.getByTestId('report-export-csv')
    await expect(exportButton).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportButton.click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^report-ar-aging-.+\.csv$/)

    const path = await download.path()
    expect(path).toBeTruthy()
    const contents = await readFile(path!, 'utf8')
    const firstLine = contents.split(/\r?\n/, 1)[0] ?? ''
    // Header is declared in app/pages/admin/reports/[slug].vue ar-aging case.
    expect(firstLine).toBe('bucket,count,balance_cents')
  })
})

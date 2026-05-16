/**
 * tests/e2e/field-photo-capture.spec.ts — W3-3 / EH-M / ADR-0029.
 *
 * # What this verifies
 *   - On a mobile viewport the photo capture page accepts a file via
 *     `<input type="file" capture="environment">`, the upload flows
 *     through `propertyPhoto.create`, and the resulting thumbnail
 *     appears in the grid.
 *
 * # Decisions (ADR-0007 / ADR-0029)
 *   - We use `setInputFiles` with a 1×1 PNG buffer so the test does
 *     not depend on an actual camera or filesystem path. The component
 *     reads the file as a dataURL and posts it through the RPC
 *     dispatcher; the seed PropertyPhotoService accepts arbitrary URLs.
 *   - We harvest the work-order's property via the admin list — same
 *     pattern as field-check-in.spec.ts to stay seed-agnostic.
 *
 * # Decision cast down
 *   - Rejected: asserting on a specific thumbnail URL. The service
 *     hashes the payload server-side; the contract guarantees the
 *     row appears in the grid, not its URL shape.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut } from './_helpers'

// 1×1 transparent PNG.
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

test.describe('Field photo capture (W3-3)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('uploads a photo and renders the thumbnail', async ({ page, context }) => {
    test.slow()

    // 1. Harvest a WO id as admin.
    await signInAsAdmin(page)
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('work-order-row').first().click()
    await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/)
    const woId = page.url().split('/').pop()!
    await signOut(context)

    // 2. Sign in as field + open the photos page.
    await signInAsField(page)
    await page.goto(`/field/jobs/${woId}/photos`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('field-photos')).toBeVisible()

    // 3. Upload a PNG.
    await page.getByTestId('field-photos-input').setInputFiles({
      name: 'site.png',
      mimeType: 'image/png',
      buffer: PNG_BUFFER,
    })

    // 4. Grid materialises with at least one tile.
    const grid = page.getByTestId('field-photos-grid')
    await expect(grid).toBeVisible({ timeout: 15_000 })
    await expect(grid.locator('img').first()).toBeVisible()
  })
})

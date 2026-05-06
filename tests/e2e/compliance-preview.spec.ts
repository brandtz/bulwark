/**
 * tests/e2e/compliance-preview.spec.ts — E7-S3.
 *
 * # Decisions (ADR-0007)
 *   - One test that drives the full async transition: submit the
 *     generator \u2192 land on the doc detail page \u2192 see the
 *     `compliance-generating` spinner \u2192 wait for the mock job timer
 *     (~2.25s) \u2192 see the `ready` state with the preview iframe and
 *     the Download PDF button.
 *   - We deliberately bias toward the success path. The failed branch
 *     is exercised at the unit level via `payload.__mockFail` in the
 *     job-mock unit suite; surfacing it through the UI requires a
 *     test-only toggle that doesn't earn its keep.
 *
 * # Decision cast down
 *   - Rejected: stubbing fetch on the iframe src to assert the exact
 *     PDF bytes. The mock URL is deliberately fake (no real PDF lives
 *     at r2.mock); E11 swaps it for a real signed URL.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function getSeedPropertyId(page: Page): Promise<string> {
  await page.goto('/admin/work-orders')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('work-order-row').first().click()
  await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/)
  const detail = page.getByTestId('work-order-detail')
  await expect(detail).toBeVisible()
  const pid = await detail.getAttribute('data-property-id')
  expect(pid).toBeTruthy()
  return pid as string
}

async function drawSignature(page: Page): Promise<void> {
  const canvas = page.getByTestId('signature-pad-canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signature canvas has no bounding box')
  const cx = box.x + box.width * 0.2
  const cy = box.y + box.height * 0.5
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 1, pointerType: 'mouse', isPrimary: true,
    clientX: cx, clientY: cy, bubbles: true, cancelable: true,
    button: 0, buttons: 1,
  })
  for (let i = 1; i <= 8; i += 1) {
    await canvas.dispatchEvent('pointermove', {
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
      clientX: cx + (box.width * 0.6 * i) / 8,
      clientY: cy + Math.sin(i) * 12,
      bubbles: true, cancelable: true, button: 0, buttons: 1,
    })
  }
  await canvas.dispatchEvent('pointerup', {
    pointerId: 1, pointerType: 'mouse', isPrimary: true,
    clientX: cx + box.width * 0.6, clientY: cy,
    bubbles: true, cancelable: true, button: 0, buttons: 0,
  })
}

test.describe('Compliance preview polling (E7-S3)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('generating spinner transitions to ready preview + download', async ({
    page,
  }) => {
    test.skip(
      process.env.BULWARK_BACKEND === 'real',
      'RealJobService + pg-boss runner not yet wired (E11-S9 / E11-S10); compliance docs stay in `generating` against the real backend.',
    )
    const propertyId = await getSeedPropertyId(page)
    await page.goto(`/admin/properties/${propertyId}/compliance/new`)
    await page.waitForLoadState('networkidle')

    await page
      .locator('[data-testid^="compliance-slot-toggle-"]')
      .first()
      .check()
    await page.getByLabel('Signer name').fill('Drew McKenzie')
    await drawSignature(page)
    await page.getByTestId('compliance-generate-button').click()

    await page.waitForURL(
      new RegExp(`/admin/properties/${propertyId}/compliance/[\\w-]+$`),
      { timeout: 15000 },
    )
    await expect(page.getByTestId('compliance-doc-detail')).toBeVisible()

    // Status snapshot at landing — usually `generating`, occasionally
    // `ready` if the job timer beat the navigation. Either is valid.
    const status = page.getByTestId('compliance-doc-status')
    await expect(status).toBeVisible()
    const initial = await status.getAttribute('data-status')
    expect(['generating', 'ready']).toContain(initial)

    // Wait for the polling cycle to flip the status to ready.
    await expect(status).toHaveAttribute('data-status', 'ready', {
      timeout: 10000,
    })

    // Preview surface and download CTA are now visible.
    await expect(page.getByTestId('compliance-preview-iframe')).toBeVisible()
    const download = page.getByTestId('compliance-download-button')
    await expect(download).toBeVisible()
    await expect(download).toHaveAttribute('href', /^https?:\/\//)
  })
})

/**
 * tests/e2e/happy-path-compliance.spec.ts — E7-S4 (Epic E7 closer).
 *
 * # Decisions (ADR-0007)
 *   - Single long serial test that walks the entire compliance journey
 *     a sponsor would demo: opening the generator, picking scope +
 *     signing + generating, watching the spinner flip to ready, and
 *     confirming the preview + download surfaces are live.
 *   - The two earlier specs (`compliance-generator.spec.ts`,
 *     `compliance-preview.spec.ts`) cover the per-story acceptance
 *     criteria. This closer threads them together under one
 *     uninterrupted serial flow so an integration regression \u2014
 *     create-row \u2192 enqueue-job \u2192 poll-sync \u2192 render-preview \u2014
 *     fails one named test rather than two.
 *
 * # Decision cast down
 *   - Rejected: routing via the property-detail Compliance tab CTA.
 *     The seed property bound to the seed WO is `accepted`, which lands
 *     in the property mock's "not found" state on direct nav. The WO
 *     list is the canonical entry point in the seeded environment.
 *   - Rejected: asserting iframe PDF bytes \u2014 E11 swaps the mock URL
 *     for a real signed URL.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

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
      clientY: cy + Math.cos(i) * 10,
      bubbles: true, cancelable: true, button: 0, buttons: 1,
    })
  }
  await canvas.dispatchEvent('pointerup', {
    pointerId: 1, pointerType: 'mouse', isPrimary: true,
    clientX: cx + box.width * 0.6, clientY: cy,
    bubbles: true, cancelable: true, button: 0, buttons: 0,
  })
}

test.describe('Compliance happy path (E7 closer)', () => {
  test('generate \u2192 generating spinner \u2192 ready preview + download', async ({
    page,
  }) => {    test.skip(
      process.env.BULWARK_BACKEND === 'real',
      'RealJobService + pg-boss runner not yet wired (E11-S9 / E11-S10); compliance docs stay in `generating` against the real backend.',
    )
    await signInAsAdmin(page)
    const propertyId = await getSeedPropertyId(page)

    // Open the generator.
    await page.goto(`/admin/properties/${propertyId}/compliance/new`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('compliance-generator')).toBeVisible()

    // Pick at least one slot, name the signer, sign, submit.
    await page
      .locator('[data-testid^="compliance-slot-toggle-"]')
      .first()
      .check()
    await page.getByLabel('Signer name').fill('Drew McKenzie')
    await drawSignature(page)

    const submit = page.getByTestId('compliance-generate-button')
    await expect(submit).toBeEnabled()
    await submit.click()

    // Land on the doc detail mid-generation.
    await page.waitForURL(
      new RegExp(`/admin/properties/${propertyId}/compliance/[\\w-]+$`),
      { timeout: 15000 },
    )
    await expect(page.getByTestId('compliance-doc-detail')).toBeVisible()
    await expect(
      page.getByTestId('compliance-doc-slot-count'),
    ).not.toHaveText('0')

    // Wait for the polling cycle to surface ready.
    const status = page.getByTestId('compliance-doc-status')
    await expect(status).toHaveAttribute('data-status', 'ready', {
      timeout: 10000,
    })
    await expect(page.getByTestId('compliance-preview-iframe')).toBeVisible()
    const download = page.getByTestId('compliance-download-button')
    await expect(download).toBeVisible()
    await expect(download).toHaveAttribute('href', /^https?:\/\//)

    // Generating spinner is gone post-terminal.
    await expect(page.getByTestId('compliance-generating')).toHaveCount(0)
  })
})

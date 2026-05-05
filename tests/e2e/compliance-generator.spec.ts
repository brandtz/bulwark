/**
 * tests/e2e/compliance-generator.spec.ts — E7-S2.
 *
 * # Decisions (ADR-0007)
 *   - Two tests against the seed work order \u2014 the seed WO has trade
 *     slots in mixed states, so the generator's checklist has real
 *     content to render and pre-check.
 *   - We resolve the seed WO's propertyId by visiting the work-order
 *     list, clicking through to the detail page, and reading the
 *     `data-property-id` attribute we expose on the detail root. That
 *     keeps the test resilient against fixture re-shuffles.
 *   - Drawing the signature uses `page.mouse` events. Chromium emits
 *     pointer events from synthetic mouse input, which is what the
 *     SignaturePad listens for. We stroke a short polyline so the
 *     captured PNG is non-empty.
 *
 * # Decision cast down
 *   - Rejected: testing the polling/preview flow. That's S3's surface;
 *     E7-S2 only needs to prove the generator collects scope + signature
 *     and creates a doc row.
 *   - Rejected: asserting the signature data URL contents. Round-tripping
 *     the canvas through chromium is racy; the form-level invariant we
 *     care about is "submit unblocks once signature is present, doc row
 *     persists with status=generating".
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
  // Use Playwright's dispatchEvent which produces real-looking pointer
  // events that the SignaturePad handlers see.
  const cx = box.x + box.width * 0.2
  const cy = box.y + box.height * 0.5
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: cx,
    clientY: cy,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
  })
  for (let i = 1; i <= 8; i += 1) {
    await canvas.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: cx + (box.width * 0.6 * i) / 8,
      clientY: cy + Math.sin(i) * 12,
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
    })
  }
  await canvas.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: cx + box.width * 0.6,
    clientY: cy,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 0,
  })
}

test.describe('Compliance generator (E7-S2)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('renders WO trade-slot checklist and guards submit until signed', async ({
    page,
  }) => {
    const propertyId = await getSeedPropertyId(page)
    await page.goto(`/admin/properties/${propertyId}/compliance/new`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('compliance-generator')).toBeVisible()
    await expect(page.getByTestId('compliance-generator-form')).toBeVisible()
    // At least one slot from the seed WO renders.
    const firstSlotToggle = page
      .locator('[data-testid^="compliance-slot-toggle-"]')
      .first()
    await expect(firstSlotToggle).toBeVisible()

    const submit = page.getByTestId('compliance-generate-button')
    // No signer name + no signature → disabled.
    await expect(submit).toBeDisabled()

    // Tick the first slot + add the signer name. Still disabled because
    // no signature.
    await firstSlotToggle.check()
    await page.getByLabel('Signer name').fill('Drew McKenzie')
    await expect(submit).toBeDisabled()

    // Now sign. Submit unlocks.
    await drawSignature(page)
    await expect(submit).toBeEnabled()

    // Clearing the signature re-locks submit.
    await page.getByTestId('signature-pad-clear').click()
    await expect(submit).toBeDisabled()
  })

  test('creates a doc and lands on the preview placeholder', async ({
    page,
  }) => {
    const propertyId = await getSeedPropertyId(page)
    await page.goto(`/admin/properties/${propertyId}/compliance/new`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('compliance-generator-form')).toBeVisible()

    await page
      .locator('[data-testid^="compliance-slot-toggle-"]')
      .first()
      .check()
    await page.getByLabel('Signer name').fill('Drew McKenzie')
    await drawSignature(page)

    await page.getByTestId('compliance-generate-button').click()

    // Redirect to the doc preview placeholder.
    await page.waitForURL(
      new RegExp(`/admin/properties/${propertyId}/compliance/[\\w-]+$`),
      { timeout: 15000 },
    )
    await expect(page.getByTestId('compliance-doc-detail')).toBeVisible()
    // Status reflects the doc row \u2014 either still generating or already
    // ready, depending on how the mock job timer fired during navigation.
    const statusEl = page.getByTestId('compliance-doc-status')
    await expect(statusEl).toBeVisible()
    const status = await statusEl.getAttribute('data-status')
    expect(['generating', 'ready']).toContain(status)
    await expect(page.getByTestId('compliance-doc-id')).toBeVisible()
  })
})

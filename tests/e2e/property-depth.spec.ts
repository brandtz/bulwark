/**
 * tests/e2e/property-depth.spec.ts — W2-1 / EH-E (ADR-0018) acceptance.
 *
 * # Decisions (ADR-0007 / ADR-0008)
 *   - Single chromium-desktop flow. We exercise the depth happy path:
 *     open a property, add a building → add a section → add a contact
 *     and mark it primary → upload a photo (as data URL). The overview
 *     tab then reflects the new depth.
 *   - We don't assert the precise tile / chip count because fixtures
 *     ship clean (zero buildings / contacts / photos pre-test) — we
 *     just assert presence after each step.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.describe('Property depth happy path (W2-1)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow for now')
    await signInAsAdmin(page)
  })

  test('admin can add a building, a section, a primary contact, and a photo', async ({ page }) => {
    await page.goto('/admin/properties')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('property-card').first().click()
    await expect(page.getByTestId('property-detail')).toBeVisible()
    await expect(page.getByTestId('property-depth-nav')).toBeVisible()

    // ── Buildings ────────────────────────────────────────────────────
    await page.locator('[data-depth-tab="buildings"]').click()
    await expect(page.getByTestId('property-buildings-page')).toBeVisible()
    await page.getByTestId('building-add-button').click()
    await page.getByTestId('building-name-input').locator('input').fill('Main house')
    await page.getByTestId('building-create-submit').click()
    await expect(page.getByTestId('building-row').first()).toBeVisible()

    // Open the building we just added and add a section.
    await page.getByTestId('building-row').first().getByRole('link', { name: 'Main house' }).click()
    await expect(page.getByTestId('building-detail-page')).toBeVisible()
    await page.getByTestId('section-add-button').click()
    await page.getByTestId('section-label-input').locator('input').fill('North roof')
    await page.getByTestId('section-add-submit').click()
    await expect(page.getByTestId('section-row').first()).toBeVisible()

    // ── Contacts ─────────────────────────────────────────────────────
    await page.locator('[data-depth-tab="contacts"]').click()
    await expect(page.getByTestId('property-contacts-page')).toBeVisible()
    await page.getByTestId('contact-add-button').click()
    await page.getByTestId('contact-name-input').locator('input').fill('Sandra Mitchell')
    await page.getByTestId('contact-is-primary').check()
    await page.getByTestId('contact-submit').click()
    const primaryBadge = page.getByTestId('contact-primary-badge')
    await expect(primaryBadge.first()).toBeVisible()

    // ── Photos ───────────────────────────────────────────────────────
    await page.locator('[data-depth-tab="photos"]').click()
    await expect(page.getByTestId('property-photos-page')).toBeVisible()
    // Upload a tiny 1×1 PNG via setInputFiles.
    const png = Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108020000009077' +
      '53DE0000000C49444154789C636060000000040001271D2A990000000049454E44AE426082',
      'hex',
    )
    await page.getByTestId('photo-upload-input').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(page.getByTestId('photo-tile').first()).toBeVisible({ timeout: 10000 })

    // ── Overview reflects the depth ─────────────────────────────────
    await page.locator('[data-depth-tab="overview"]').click()
    await expect(page.getByTestId('overview-buildings')).toBeVisible()
    await expect(page.getByTestId('overview-primary-contact')).toBeVisible()
    await expect(page.getByTestId('overview-primary-photo')).toBeVisible()
  })
})

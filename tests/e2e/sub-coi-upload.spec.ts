/**
 * tests/e2e/sub-coi-upload.spec.ts — W4-2 (deferred from W3-4 / EH-N /
 * ADR-0031).
 *
 * # What this spec covers
 *   - jeff (Roof King Co. sub user) logs into the portal, opens
 *     `/sub/cois`, submits the COI upload form with a URL + expiry,
 *     and asserts the new doc appears in the list with an expiry
 *     bucket pill (active / expiring / expired).
 *
 * # Decisions (ADR-0007 / ADR-0031)
 *   - Real-backend only (needs the subcontractor_users join row).
 *   - The portal's "upload" is a URL+filename+expiry form, NOT a real
 *     file picker — see the cois.vue rich-comment header. This spec
 *     drives the form fields and asserts the resulting `<li>` renders.
 *   - We use a unique filename per run (timestamp suffix) so list
 *     assertion is order-stable even when the seed accumulates COIs
 *     from prior runs.
 */
import { test, expect } from '@playwright/test'
import { signIn } from './_helpers'
import { seedSubPortal, SUB_PORTAL_FIXTURE } from '../setup/seed-sub-portal'

test.describe('Sub portal COI upload (W4-2 / EH-N)', () => {
  test.beforeAll(async () => {
    test.skip(process.env.BULWARK_BACKEND !== 'real', 'real-backend only — needs subcontractor_users seed')
    await seedSubPortal()
  })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signIn(page.context(), SUB_PORTAL_FIXTURE.subUserEmail)
  })

  test('sub uploads a COI and sees it in the list with a status pill', async ({ page }) => {
    await page.goto('/sub/cois')
    await expect(page.getByTestId('sub-cois')).toBeVisible()

    const stamp = Date.now()
    const fileName = `coi-w4-2-${stamp}.pdf`
    const expiryIso = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)

    await page.getByTestId('sub-coi-file-url').fill(`https://example.invalid/${fileName}`)
    await page.getByTestId('sub-coi-file-name').fill(fileName)
    await page.getByTestId('sub-coi-expires').fill(expiryIso)
    await page.getByTestId('sub-coi-submit').click()

    const list = page.getByTestId('sub-coi-list')
    await expect(list).toBeVisible()
    const row = list.locator('li', { hasText: fileName }).first()
    await expect(row).toBeVisible()
    // Expiry bucket is rendered as a span with [data-bucket=...] —
    // for a 1-year-out expiry the bucket is "active".
    await expect(row.locator('[data-bucket="active"]')).toBeVisible()
  })
})

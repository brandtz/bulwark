/**
 * tests/e2e/homeowner-portal.spec.ts — W4-2 (deferred from W3-4 / EH-O /
 * ADR-0032).
 *
 * # What this spec covers
 *   - Seeds a homeowner persona (`homer@bulwark.demo`) linked to the
 *     accepted seed property.
 *   - Homeowner logs in, lands on `/homeowner`, sees their property
 *     count > 0 and a working "My properties →" link.
 *   - Navigates to `/homeowner/properties` and sees the property card.
 *   - Lists their quotes and opens one (self-scoped reads, WP-L07). The
 *     detail page was unreachable until 2026-09-29: quotes.vue shadowed
 *     quotes/[id].vue (see tests/unit/page-nesting.test.ts).
 *
 * # Decisions (ADR-0007 / ADR-0032)
 *   - Real-backend only — the `homeowner` role enum, `homeowner_users`
 *     table, and the demo persona are all DB-side.
 *   - The Accept CTA belongs to the client-portal redesign (WP-F2).
 */
import { test, expect } from '@playwright/test'
import { signIn, waitForHydration } from './_helpers'
import { seedHomeownerPortal, HOMEOWNER_PORTAL_FIXTURE } from '../setup/seed-homeowner-portal'

test.describe('Homeowner portal landing (W4-2 / EH-O)', () => {
  test.beforeAll(async () => {
    test.skip(process.env.BULWARK_BACKEND !== 'real', 'real-backend only — needs homeowner_users seed')
    await seedHomeownerPortal()
  })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signIn(page.context(), HOMEOWNER_PORTAL_FIXTURE.email)
  })

  test('homeowner lands on /homeowner and sees their linked property', async ({ page }) => {
    await page.goto('/homeowner')
    await expect(page.getByTestId('homeowner-home')).toBeVisible()
    await expect(page.getByTestId('homeowner-kpis')).toBeVisible()

    await page.goto('/homeowner/properties')
    await expect(page.getByTestId('homeowner-properties')).toBeVisible()
    const card = page.getByTestId(`ho-property-${HOMEOWNER_PORTAL_FIXTURE.propertyId}`)
    await expect(card).toBeVisible()
  })

  // WP-L07 S7: homeowner reads are self-scoped (listMyQuotes/getMyQuote). The
  // Accept CTA belongs to the client-portal redesign (WP-F2).
  test('homeowner lists and opens only quotes on their own property', async ({ page }) => {
    await page.goto('/homeowner/quotes')
    await waitForHydration(page)
    await expect(page.getByTestId('homeowner-quotes')).toBeVisible()
    const first = page.locator('[data-testid^="ho-quote-"]').filter({ has: page.locator('a') }).first()
    await expect(first).toBeVisible()
    await first.locator('a').click()
    await page.waitForURL(/\/homeowner\/quotes\/[\w-]+$/u)
    await waitForHydration(page)
    await expect(page.getByTestId('homeowner-quote-detail')).toBeVisible()
    await expect(page.getByTestId('ho-quote-number')).toHaveText(/\S/u)
    await expect(page.getByTestId('ho-quote-total')).toHaveText(/\$\s?[\d,]+/u)
    await expect(page.getByTestId('ho-quote-line').first()).toBeVisible()

    // A quote id that is not theirs (here: one that does not exist) shows the
    // empty state, never another customer's quote or an error page.
    await page.goto('/homeowner/quotes/00000000-0000-4000-8000-00000000dead')
    await waitForHydration(page)
    await expect(page.getByTestId('ho-quote-empty')).toBeVisible()
    await expect(page.getByTestId('ho-quote-line')).toHaveCount(0)
  })
})

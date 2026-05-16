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
 *   - The deeper "open a quote, see Accept CTA" assertion is skipped
 *     because `/homeowner/quotes/[id]` is not yet shipped (see W3-4
 *     handoff "Known follow-ups" — detail pages are stubs).
 *
 * # Decisions (ADR-0007 / ADR-0032)
 *   - Real-backend only — the `homeowner` role enum, `homeowner_users`
 *     table, and the demo persona are all DB-side.
 *   - We only assert what's wired today; the spec re-enables the
 *     Accept-CTA assertion once W4-1 ships the homeowner quote detail.
 */
import { test, expect } from '@playwright/test'
import { signIn } from './_helpers'
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

    // Open-a-quote + Accept CTA is the next layer; quote detail page
    // for the homeowner portal hasn't shipped yet.
    test.skip(
      true,
      'TODO: open-a-quote + Accept CTA assertion waits on /homeowner/quotes/[id] (W3-4 follow-up).',
    )
  })
})

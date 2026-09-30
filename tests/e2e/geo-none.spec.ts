/**
 * tests/e2e/geo-none.spec.ts — WP-X3 acceptance: no geo key (ED-00C `none` driver).
 *
 * With no Mapbox key configured (CI and local default) the geo service answers
 * disabled/empty instead of failing, the static-map proxy refuses rather than
 * leaking a provider URL, and property intake still takes a free-text address.
 * Address autocomplete UI arrives with the AD-11 redesign (WP-B2), which must
 * keep this free-text path when `geo.status().enabled` is false.
 */
import { expect, test } from '@playwright/test'
import { signInAsAdmin, waitForHydration } from './_helpers'

const BASE = 'http://localhost:3000'

test.describe('geo without a provider key (WP-X3)', () => {
  test.skip(process.env.BULWARK_BACKEND === 'mock', 'exercises the real geo service and proxy route')
  test.skip(!!process.env.MAPBOX_ACCESS_TOKEN, 'a platform Mapbox key is configured')

  test('geo answers disabled and empty; the static-map proxy refuses', async ({ page, request }) => {
    expect((await request.get(`${BASE}/api/geo/static-map?lat=38.44&lng=-122.71`)).status()).toBe(401)

    await signInAsAdmin(page)
    const rpc = async (method: string, args: unknown[]) => {
      const res = await page.request.post(`${BASE}/api/services/geo/${method}`, { data: { args } })
      expect(res.status(), `geo.${method}`).toBe(200)
      return res.json()
    }
    const me = await (await page.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()
    const organizationId = me.activeOrganizationId as string
    expect(await rpc('status', [organizationId])).toEqual({ provider: 'none', enabled: false })
    expect(await rpc('autocomplete', [{ organizationId, query: '100 Main Street' }])).toEqual([])
    expect(await rpc('staticMap', [{ organizationId, point: { lat: 38.44, lng: -122.71 } }])).toEqual({ url: null })
    expect((await page.request.get(`${BASE}/api/geo/static-map?lat=38.44&lng=-122.71`)).status()).toBe(404)
    expect((await page.request.get(`${BASE}/api/geo/static-map?lat=999&lng=0`)).status()).toBe(400)
  })

  test('property intake takes a free-text address with no suggestions list', async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto('/admin/properties/new')
    await waitForHydration(page)
    const street = `${Date.now() % 100000} Free Text Lane`
    const line1 = page.locator('[data-testid="field-addressLine1"] input, input[data-testid="field-addressLine1"]').first()
    await line1.fill(street)
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await page.locator('[data-testid="field-city"] input, input[data-testid="field-city"]').first().fill('Santa Rosa')
    const stateField = page.locator('[data-testid="field-state"] input, input[data-testid="field-state"], [data-testid="field-state"] select, select[data-testid="field-state"]').first()
    if (await stateField.evaluate((el) => el.tagName === 'SELECT')) await stateField.selectOption('CA')
    else await stateField.fill('CA')
    await page.locator('[data-testid="field-postalCode"] input, input[data-testid="field-postalCode"]').first().fill('95401')
    await page.getByTestId('submit-button').click()
    await page.waitForURL(/\/admin\/properties\/[\w-]+$/u)
    await expect(page.getByText(street).first()).toBeVisible()
  })
})

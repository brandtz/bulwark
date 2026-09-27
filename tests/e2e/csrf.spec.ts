/**
 * WP-L07 S1 — CSRF at the HTTP boundary: a signed-in browser context's unsafe
 * API calls need the double-submit header; the app itself sends it.
 */
import { test, expect } from '@playwright/test'
import { signIn } from './_helpers'

const BASE = 'http://localhost:3000'

test.describe('CSRF double-submit', () => {
  test.beforeEach(async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'API-level checks run once')
    test.skip(process.env.BULWARK_BACKEND !== 'real', 'enforced by the real server middleware')
    await context.clearCookies()
  })

  test('unsafe calls without or with a wrong token are refused; the right token works', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      await signIn(context, 'drew@bulwark.demo')
      const token = (await context.cookies(BASE)).find((c) => c.name === 'bulwark.csrf')?.value
      expect(token).toBeTruthy()
      const url = `${BASE}/api/services/auth/currentUser`

      await context.setExtraHTTPHeaders({})
      const missing = await context.request.post(url, { data: { args: [] } })
      expect(missing.status()).toBe(403)
      expect(await missing.text()).toContain('CSRF token missing')

      const wrong = await context.request.post(url, { data: { args: [] }, headers: { 'x-csrf-token': 'forged' } })
      expect(wrong.status()).toBe(403)

      const ok = await context.request.post(url, { data: { args: [] }, headers: { 'x-csrf-token': token! } })
      expect(ok.status()).toBeLessThan(300)
    } finally {
      await context.close()
    }
  })

  test('the app attaches the token itself: signed-in pages load and save', async ({ page }) => {
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.context().setExtraHTTPHeaders({}) // prove the app, not the test helper, sends it
    const refused: string[] = []
    page.on('response', (r) => { if (r.status() === 403 && r.url().includes('/api/')) refused.push(r.url()) })
    await page.goto('/admin/dashboard')
    await expect(page.getByTestId('user-menu-button')).toBeVisible()
    await page.goto('/settings/providers')
    await expect(page.getByTestId('delivery-health')).toBeVisible()
    expect(refused).toEqual([])
  })
})

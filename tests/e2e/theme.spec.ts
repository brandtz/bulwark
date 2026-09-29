/**
 * Bounded A1 token behavior on the real /dev/ui route at desktop/mobile sizes.
 * Existing elements opt into token-backed styles in the browser; no fixture UI
 * or replacement token stylesheet is injected. Legacy styling is checked first.
 * Attachments document token consumption and runtime theme preference behavior.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

// The page background paints from <html> (the canvas); body repeats the same token. Assert on
// the root: Playwright's WebKit with isMobile emulation (mobile-safari project) reports a stale
// getComputedStyle(body) until the next root mutation, although the rendered page is correct.
const pageCanvas = (page: Page) => page.locator('html')

test('SSR applies cookie-backed preferences and an accessible accent to the document root', async ({ page }) => {
  const remoteFontRequests: string[] = []
  page.on('request', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/iu.test(request.url())) remoteFontRequests.push(request.url())
  })
  await page.context().addCookies([
    { name: 'bulwark.theme', value: 'dark', url: 'http://localhost:3000', sameSite: 'Lax' },
    { name: 'bulwark.density', value: 'touch', url: 'http://localhost:3000', sameSite: 'Lax' },
  ])
  const response = await page.goto('/dev/ui')
  expect(response?.ok()).toBe(true)
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(root).toHaveAttribute('data-density', 'touch')
  await expect(root).toHaveAttribute('data-accent', /^#[\da-f]{6}$/iu)
  expect(await root.evaluate((element) => getComputedStyle(element).getPropertyValue('--on-accent').trim()))
    .toMatch(/^#[\da-f]{6}$/iu)
  await page.evaluate(() => document.fonts.ready)
  expect(remoteFontRequests).toEqual([])
  expect(await root.evaluate(() => document.fonts.check('14px "IBM Plex Sans"'))).toBe(true)
})

test('system mode uses the OS color scheme before hydration and reacts to changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.context().addCookies([
    { name: 'bulwark.theme', value: 'system', url: 'http://localhost:3000', sameSite: 'Lax' },
  ])
  const response = await page.goto('/dev/ui', { waitUntil: 'domcontentloaded' })
  expect(response?.ok()).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system')
  await expect(pageCanvas(page)).toHaveCSS('background-color', 'rgb(22, 27, 34)')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(pageCanvas(page)).toHaveCSS('background-color', 'rgb(245, 247, 248)')
})

test('signed-in theme and density preferences persist across SSR reload', async ({ page }) => {
  test.skip(process.env.BULWARK_BACKEND !== 'real', 'user_prefs persistence requires the real backend')
  test.setTimeout(120_000)
  await signInAsAdmin(page)
  const save = () => page.request.post('/api/services/themePreferences/updateCurrent', {
    data: { args: [{ theme: 'dark', density: 'touch' }] },
  })
  const response = await save()
  expect(response.ok(), `theme preference save failed: ${response.status()} ${await response.text()}`).toBe(true)
  const pageResponse = await page.goto('/dev/ui', { waitUntil: 'domcontentloaded' })
  expect(pageResponse?.ok()).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-density', 'touch')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-density', 'touch')
})

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`Jobsite token consumers at ${viewport.width}px`, () => {
    test.use({ viewport })

    test('real app surfaces respond to theme and density tokens', async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      const response = await page.goto('/dev/ui')
      expect(response?.ok()).toBe(true)
      const buttons = page.locator('[data-section="buttons"]')
      const primary = buttons.getByRole('button', { name: 'Primary', exact: true })
      const card = page.locator('[data-section="display"] .bg-surface').first()
      await expect(buttons).toBeVisible()
      await expect(primary).toBeVisible()
      await expect(card).toBeVisible()
      const root = page.locator('html')
      const accent = await root.getAttribute('data-accent')
      await expect(primary).toHaveCSS('background-color', 'rgb(29, 78, 216)')
      await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(pageCanvas(page)).toHaveCSS('background-color', 'rgb(245, 247, 248)')
      const lightScreenshot = await page.screenshot({ animations: 'disabled' })

      // Theme is owned by the Nuxt preference plugin. Changing the DOM
      // attribute directly races that plugin and can be overwritten.
      await page.context().addCookies([{ name: 'bulwark.theme', value: 'dark', url: 'http://localhost:3000', sameSite: 'Lax' }])
      await page.reload()
      await expect(primary).toHaveCSS('background-color', 'rgb(15, 118, 110)')
      await expect(card).toHaveCSS('background-color', 'rgb(31, 36, 43)')
      await expect(pageCanvas(page)).toHaveCSS('background-color', 'rgb(22, 27, 34)')
      expect(await root.getAttribute('data-accent')).toBe(accent)
      const darkScreenshot = await page.screenshot({ animations: 'disabled' })
      expect(Buffer.compare(lightScreenshot, darkScreenshot)).not.toBe(0)

      for (const theme of ['light', 'dark'] as const) {
        await page.context().addCookies([{ name: 'bulwark.theme', value: theme, url: 'http://localhost:3000', sameSite: 'Lax' }])
        await page.reload()
        const expectedCard = theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(31, 36, 43)'
        await expect(card).toHaveCSS('background-color', expectedCard)
        await expect(pageCanvas(page)).toHaveCSS('background-color', theme === 'light' ? 'rgb(245, 247, 248)' : 'rgb(22, 27, 34)')

        const densityTarget = page.locator('body')
        for (const [density, height, padding] of [
          ['compact', '32px', '16px'], ['touch', '48px', '20px'], ['comfortable', '40px', '24px'],
        ]) {
          await page.context().addCookies([{ name: 'bulwark.density', value: density!, url: 'http://localhost:3000', sameSite: 'Lax' }])
          await page.reload()
          await expect(densityTarget).toHaveCSS('--control-h', height!)
          await expect(densityTarget).toHaveCSS('--card-p', padding!)
          await expect(densityTarget).toHaveCSS('--touch-min', density === 'compact' ? '32px' : density === 'touch' ? '48px' : '40px')
        }
        await buttons.scrollIntoViewIfNeeded()
        const bounds = await buttons.boundingBox()
        expect(bounds?.width).toBeGreaterThan(200)
        expect(bounds?.height).toBeGreaterThan(60)
        const path = testInfo.outputPath(`token-consumers-${theme}-${viewport.width}.png`)
        const screenshot = await page.screenshot({ path, animations: 'disabled' })
        expect(screenshot.byteLength).toBeGreaterThan(10_000)
        await testInfo.attach(`token-consumers-${theme}-${viewport.width}`, { path, contentType: 'image/png' })

      }
    })
  })
}

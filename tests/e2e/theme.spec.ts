/**
 * Bounded A1 token behavior on the real /dev/ui route at desktop/mobile sizes.
 * Existing elements opt into token-backed styles in the browser; no fixture UI
 * or replacement token stylesheet is injected. Legacy styling is checked first.
 * Attachments document token consumption only, not whole-system dark acceptance.
 * Preference persistence, SSR branding and self-hosted fonts are separate work.
 */
import { test, expect } from '@playwright/test'
import { computeOnAccent } from '../../shared/utils/theme'

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

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`Jobsite token consumers at ${viewport.width}px`, () => {
    test.use({ viewport })

    test('theme, density and nested accent affect only opted-in surfaces', async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      const response = await page.goto('/dev/ui')
      expect(response?.ok()).toBe(true)
      const buttons = page.locator('[data-section="buttons"]')
      const primary = buttons.getByRole('button', { name: 'Primary', exact: true })
      await expect(buttons).toBeVisible()
      await expect(primary).toBeVisible()
      await page.waitForLoadState('networkidle')
      const legacy = await primary.evaluate((element) => ({
        button: getComputedStyle(element).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
      }))
      expect(legacy).toEqual({ button: 'rgb(29, 78, 216)', body: 'rgb(248, 250, 252)' })
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
      await expect(primary).toHaveCSS('background-color', legacy.button)
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(legacy.body)

      await buttons.evaluate((element) => {
        const section = element as HTMLElement
        section.style.backgroundColor = 'var(--bg-card)'
        section.style.color = 'var(--text-primary)'
        section.style.padding = 'var(--card-p)'
        section.style.borderRadius = 'var(--radius-md)'
        const parent = section.parentElement!
        parent.style.backgroundColor = 'var(--bg-page)'
      })
      await primary.evaluate((element) => {
        const button = element as HTMLElement
        button.style.backgroundColor = 'var(--accent)'
        button.style.color = 'var(--on-accent)'
        button.style.height = 'var(--control-h)'
        button.style.minHeight = 'var(--touch-min)'
      })

      for (const theme of ['light', 'dark'] as const) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
        const expectedCard = theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(31, 36, 43)'
        const expectedInk = theme === 'light' ? 'rgb(22, 27, 34)' : 'rgb(245, 247, 248)'
        await expect(buttons).toHaveCSS('background-color', expectedCard)
        await expect(buttons).toHaveCSS('color', expectedInk)
        expect(await buttons.evaluate((element) => getComputedStyle(element.parentElement!).backgroundColor))
          .toBe(theme === 'light' ? 'rgb(245, 247, 248)' : 'rgb(22, 27, 34)')
        await expect(primary).toHaveCSS('background-color', 'rgb(15, 118, 110)')
        await expect(primary).toHaveCSS('color', 'rgb(255, 255, 255)')

        for (const [density, height, padding] of [
          ['compact', '32px', '16px'], ['touch', '48px', '20px'], ['comfortable', '40px', '24px'],
        ]) {
          await page.evaluate((value) => { document.documentElement.dataset.density = value }, density!)
          await expect(primary).toHaveCSS('height', height!)
          await expect(buttons).toHaveCSS('padding-top', padding!)
        }

        await buttons.evaluate((element, foreground) => {
          const section = element as HTMLElement
          section.dataset.accent = ''
          section.style.setProperty('--accent', '#F5D90A')
          section.style.setProperty('--on-accent', foreground)
        }, computeOnAccent('#F5D90A'))
        await expect(primary).toHaveCSS('background-color', 'rgb(245, 217, 10)')
        await expect(primary).toHaveCSS('color', 'rgb(22, 27, 34)')
        await expect(primary).toHaveCSS('height', '40px')
        await expect(buttons).toHaveCSS('background-color', expectedCard)
        await expect(buttons).toHaveCSS('color', expectedInk)
        expect(await buttons.evaluate((element) => getComputedStyle(element).getPropertyValue('--accent-500').trim()))
          .toBe('#F5D90A')

        const secondary = buttons.getByRole('button', { name: 'Secondary', exact: true })
        await secondary.evaluate((element) => {
          const button = element as HTMLElement
          button.dataset.hue = 'blue'
          button.style.backgroundColor = 'var(--hue-bg)'
          button.style.color = 'var(--hue-fg)'
          button.style.borderColor = 'var(--hue-border)'
        })
        await expect(secondary).toHaveCSS('background-color', theme === 'light' ? 'rgb(224, 236, 250)' : 'rgb(19, 42, 69)')
        await expect(secondary).toHaveCSS('color', theme === 'light' ? 'rgb(31, 78, 140)' : 'rgb(141, 184, 236)')
        await expect(secondary).toHaveCSS('border-top-color', theme === 'light' ? 'rgb(185, 209, 240)' : 'rgb(31, 64, 102)')
        await buttons.scrollIntoViewIfNeeded()
        const bounds = await buttons.boundingBox()
        expect(bounds?.width).toBeGreaterThan(200)
        expect(bounds?.height).toBeGreaterThan(80)
        const path = testInfo.outputPath(`token-consumers-${theme}-${viewport.width}.png`)
        const screenshot = await page.screenshot({ path, animations: 'disabled' })
        expect(screenshot.byteLength).toBeGreaterThan(10_000)
        await testInfo.attach(`token-consumers-${theme}-${viewport.width}`, { path, contentType: 'image/png' })

        await buttons.evaluate((element) => {
          const section = element as HTMLElement
          delete section.dataset.accent
          section.style.removeProperty('--accent')
          section.style.removeProperty('--on-accent')
        })
      }
    })
  })
}
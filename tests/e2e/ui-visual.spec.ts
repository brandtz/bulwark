/**
 * tests/e2e/ui-visual.spec.ts — WP-A2 visual parity: primitives vs the design.
 *
 * For each specimen in tests/fixtures/design/ui-specimens.json (element markup
 * exported from the design's component pages by
 * scripts/codegraph/export-ui-specimens.mjs), this renders the design's own
 * markup with the design's own CSS (tests/fixtures/design/packet-a-*.css) and
 * the live primitive from /dev/ui, in the same browser, then compares pixels on
 * a canvas. Same OS, same fonts, same engine: any difference is the component,
 * not the platform, so it runs in CI too.
 *
 * Tolerance: at most 0.5% of pixels may differ by more than a small channel
 * delta (antialiasing at rounded edges). Sizes must match exactly.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { waitForHydration } from './_helpers'

interface Specimen { name: string, component: string, theme: 'light' | 'dark', selector: string, html: string }
const FIX = path.resolve(process.cwd(), 'tests', 'fixtures', 'design')
const specimens = (JSON.parse(readFileSync(path.join(FIX, 'ui-specimens.json'), 'utf8')) as { specimens: Specimen[] }).specimens
const designCss = ['packet-a-tokens.css', 'packet-a-base.css'].map((f) => readFileSync(path.join(FIX, f), 'utf8')).join('\n')

const FONTS = `
@font-face { font-family: Barlow; src: url('/fonts/barlow-latin-400-normal.woff2') format('woff2'); font-weight: 400; }
@font-face { font-family: Barlow; src: url('/fonts/barlow-latin-500-normal.woff2') format('woff2'); font-weight: 500; }
@font-face { font-family: Barlow; src: url('/fonts/barlow-latin-600-normal.woff2') format('woff2'); font-weight: 600; }
@font-face { font-family: Barlow; src: url('/fonts/barlow-latin-700-normal.woff2') format('woff2'); font-weight: 700; }
@font-face { font-family: 'IBM Plex Sans'; src: url('/fonts/ibm-plex-sans-latin-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
`

const MAX_DIFF_RATIO = 0.005

async function diffRatio(page: Page, a: Buffer, b: Buffer): Promise<{ ratio: number, size: string }> {
  return await page.evaluate(async ([a64, b64]) => {
    const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = `data:image/png;base64,${src}`
    })
    const [ia, ib] = await Promise.all([load(a64), load(b64)])
    const size = `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}`
    if (ia.width !== ib.width || ia.height !== ib.height) return { ratio: 1, size }
    const px = (img: HTMLImageElement) => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, img.width, img.height).data
    }
    const da = px(ia)
    const db = px(ib)
    let diff = 0
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i]! - db[i]!), Math.abs(da[i + 1]! - db[i + 1]!), Math.abs(da[i + 2]! - db[i + 2]!))
      if (d > 24) diff++
    }
    return { ratio: diff / (da.length / 4), size }
  }, [a.toString('base64'), b.toString('base64')] as const)
}

test.describe('primitives match the design specimens (WP-A2)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(({ browserName }) => browserName !== 'chromium', 'pixel comparison runs once, in Chromium')

  test('each specimen element renders the same in the app as in the design', async ({ page, context }) => {
    test.setTimeout(120_000)
    // Signed out on purpose: /dev/ui is public in test servers, and a signed-in
    // persona carries saved theme/accent/density preferences (theme.spec sets
    // some), which would recolour the live primitives.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dev/ui')
    await waitForHydration(page)
    await page.evaluate(() => document.fonts.ready)

    // Same origin as the app, so the design markup loads the same font files.
    const design = await context.newPage()
    await design.setViewportSize({ width: 1440, height: 900 })
    await design.goto('/fonts/barlow-OFL.txt')

    const failures: string[] = []
    for (const s of specimens) {
      const live = page.locator(`[data-panel="${s.theme}"] ${s.selector}`).first()
      if (!(await live.count())) { failures.push(`${s.name}/${s.theme}: not on /dev/ui (${s.selector})`); continue }
      await design.setContent(`<!doctype html><html data-theme="${s.theme}" data-density="comfortable"><head><style>${FONTS}${designCss}</style></head><body style="margin:0;padding:24px;background:var(--bg-page);color:var(--text-primary);font-family:var(--font-body)">${s.html}</body></html>`)
      await design.evaluate(() => document.fonts.ready)
      const expected = await design.locator('body > *').first().screenshot({ animations: 'disabled' })
      // Clone the live (Vue-rendered) element into a fixed host at integer
      // coordinates: in the page flow it can sit at y = 720.5, and a half-pixel
      // origin changes text rasterisation and the clip size by 1px. The clone
      // keeps its classes and scoped-style attributes, so app CSS still applies.
      await live.evaluate((node, theme) => {
        document.getElementById('vp-host')?.remove()
        const host = document.createElement('div')
        host.id = 'vp-host'
        host.setAttribute('data-theme', theme)
        host.setAttribute('data-density', 'comfortable')
        host.setAttribute('data-panel', 'visual-probe')
        Object.assign(host.style, { position: 'fixed', left: '0px', top: '0px', padding: '24px', background: 'var(--bg-page)', zIndex: '99999' })
        host.appendChild(node.cloneNode(true))
        document.body.appendChild(host)
      }, s.theme)
      const actual = await page.locator('#vp-host > *').first().screenshot({ animations: 'disabled' })
      const { ratio, size } = await diffRatio(page, actual, expected)
      if (ratio > MAX_DIFF_RATIO) failures.push(`${s.name}/${s.theme}: ${(ratio * 100).toFixed(2)}% of pixels differ (${size})`)
    }
    await design.close()
    expect(failures, failures.join('\n')).toEqual([])
  })
})

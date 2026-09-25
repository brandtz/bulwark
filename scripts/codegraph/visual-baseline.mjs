#!/usr/bin/env node
/**
 * scripts/codegraph/visual-baseline.mjs [ID ...] [--all]
 *
 * Renders design prototypes (desktop/mobile/dark/tablet.html) with Playwright's Chromium
 * into tests/e2e/screens/__baselines__/<ID>-<variant>.png so screen specs can compare the
 * live app against the DESIGN. Re-run whenever a design SPEC folder changes.
 *
 * Uses the same viewports as tests/e2e/screens/_visual.ts.
 */
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GRAPH = JSON.parse(await fs.readFile(path.join(ROOT, 'agents', 'codegraph', 'graph.json'), 'utf8'))
const OUT = path.join(ROOT, 'tests', 'e2e', 'screens', '__baselines__')
const VIEWPORT = { desktop: { width: 1440, height: 900 }, dark: { width: 1440, height: 900 }, tablet: { width: 1024, height: 768 }, mobile: { width: 390, height: 844 } }

const args = process.argv.slice(2)
const ids = args.includes('--all')
  ? GRAPH.nodes.filter((n) => n.type === 'design' && n.status === 'received' && n.dir).map((n) => n.id.replace('design:', ''))
  : args.filter((a) => !a.startsWith('--'))
if (!ids.length) { console.error('usage: visual-baseline.mjs <ID ...> | --all'); process.exit(1) }

const { chromium } = await import('@playwright/test')
const browser = await chromium.launch()
await fs.mkdir(OUT, { recursive: true })
for (const id of ids) {
  const node = GRAPH.nodes.find((n) => n.id === `design:${id}`)
  if (!node?.dir) { console.error(`✖ ${id}: no received design folder`); continue }
  for (const variant of Object.keys(VIEWPORT)) {
    const file = path.join(ROOT, node.dir, `${variant}.html`)
    if (!existsSync(file)) continue
    const page = await browser.newPage({ viewport: VIEWPORT[variant], deviceScaleFactor: 1 })
    await page.goto('file:///' + file.replace(/\\/g, '/'))
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.evaluate(() => document.fonts?.ready)
    await page.screenshot({ path: path.join(OUT, `${id}-${variant}.png`), animations: 'disabled' })
    await page.close()
    console.log(`✔ ${id}-${variant}.png`)
  }
}
await browser.close()

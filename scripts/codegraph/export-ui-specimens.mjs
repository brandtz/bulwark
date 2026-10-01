#!/usr/bin/env node
/**
 * scripts/codegraph/export-ui-specimens.mjs — WP-A2 visual parity fixtures.
 *
 * The design's component specimens (agents/design/return/.../A/components/*.html)
 * are gitignored, and a PNG rendered on one OS never matches another OS's text
 * rendering within 0.5%. So instead of images this commits each specimen
 * element's MARKUP (tests/fixtures/design/ui-specimens.json). The spec
 * tests/e2e/ui-visual.spec.ts renders that markup with the design's committed
 * CSS (tests/fixtures/design/packet-a-*.css) in the same browser as the live
 * /dev/ui element and compares pixels, so it runs anywhere, CI included.
 *
 *   node scripts/codegraph/export-ui-specimens.mjs          # regenerate
 *   node scripts/codegraph/export-ui-specimens.mjs --check  # fail when stale
 * Skips (exit 0) when the design return is not on disk.
 *
 * PAIRS: specimen selector (inside [data-theme=<theme>] of the specimen page)
 * and /dev/ui selector (inside [data-panel=<theme>]). Labels match on purpose.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = path.join(ROOT, 'agents', 'design', 'return', 'design-return', 'A', 'components')
const OUT = path.join(ROOT, 'tests', 'fixtures', 'design', 'ui-specimens.json')

if (!existsSync(DIR)) {
  console.log('export-ui-specimens: design return not present — skipping (using the committed fixtures).')
  process.exit(0)
}

const HUES = ['slate', 'blue', 'indigo', 'violet', 'teal', 'green', 'lime', 'amber', 'orange', 'red', 'pink', 'gray']
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const both = ['light', 'dark']

/** [name, specimen file, selector (same in specimen and /dev/ui), themes, why a theme is skipped] */
const PAIRS = [
  ['button-primary', 'BulwarkButton', '.bw-btn--primary:text-is("New Quote")', both],
  ['button-secondary', 'BulwarkButton', '.bw-btn--secondary:text-is("Schedule")', both],
  // Light ghost/link text uses accent-700 (ED-065: accent-600 fails 4.5:1 for light accents).
  ['button-ghost', 'BulwarkButton', '.bw-btn--ghost:text-is("View All")', ['dark']],
  // Dark: white on the dark danger fill is 2.5:1; BulwarkButton uses dark ink (WP-A2).
  ['button-destructive', 'BulwarkButton', '.bw-btn--destructive:text-is("Delete Property")', ['light']],
  ['button-link', 'BulwarkButton', '.bw-btn--link:text-is("Learn more")', ['dark']],
  ...HUES.map((h) => [`badge-${h}`, 'StatusBadge', `.bw-badge[data-hue="${h}"]:text-is("${cap(h)}")`, both]),
  ['toggle-on', 'BulwarkToggle', '.bw-toggle.is-on', both],
  ['toggle-off', 'BulwarkToggle', '.bw-toggle:not(.is-on):not(.is-disabled)', both],
  // WP-A3. Banners and icon chips are left out: the specimen draws Lucide from a CDN,
  // the app its own sprite, so glyph pixels differ by design.
  ['chip-default', 'BulwarkChips', '.bw-chip:not(.bw-chip--accent):text-is("Roofing")', both],
]

const { chromium } = await import('@playwright/test')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const out = []
for (const [name, file, selector, themes] of PAIRS) {
  await page.goto('file:///' + path.join(DIR, `${file}.html`).replace(/\\/gu, '/'))
  await page.waitForLoadState('networkidle').catch(() => {})
  for (const theme of themes) {
    const el = page.locator(`[data-theme="${theme}"] ${selector}`).first()
    if (!(await el.count())) { console.error(`✖ ${name}/${theme}: ${selector} not found in ${file}.html`); process.exitCode = 1; continue }
    const html = await el.evaluate((n) => n.outerHTML.replace(/\s+tabindex="[^"]*"/gu, ''))
    out.push({ name, component: file, theme, selector, html })
  }
}
await browser.close()

const json = JSON.stringify({ generatedFrom: 'agents/design/return/design-return/A/components', specimens: out }, null, 1) + '\n'
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/gu, '\n') : ''
  if (current !== json) { console.error('export-ui-specimens: tests/fixtures/design/ui-specimens.json is stale'); process.exit(1) }
  console.log(`ui specimens current: ${out.length}`)
} else {
  writeFileSync(OUT, json)
  console.log(`ui specimens: ${out.length} → ${path.relative(ROOT, OUT)}`)
}

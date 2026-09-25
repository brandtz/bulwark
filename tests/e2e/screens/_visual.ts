/**
 * tests/e2e/screens/_visual.ts — visual parity against the *design* HTML.
 *
 * Baselines are PNGs rendered from the Claude Design prototypes
 * (agents/design/return/.../{desktop,mobile,dark,tablet}.html) by
 * `pnpm screen:baseline [ID]` (scripts/codegraph/visual-baseline.mjs) into
 * tests/e2e/screens/__baselines__/<ID>-<variant>.png. playwright.config.ts points
 * `snapshotPathTemplate` at that folder, so `toMatchSnapshot` compares the live app
 * against the design — the design is the target, not a previous app screenshot.
 *
 * Tolerance is loose (1.5%) because live seed data ≠ design sample data; pass `mask`
 * for dynamic regions or `clip` a stable region. Never loosen globally — loosen per screen
 * with a comment citing the reason.
 */
import { expect, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import path from 'node:path'

export type VisualVariant = 'desktop' | 'mobile' | 'dark' | 'tablet'
export const VARIANT_VIEWPORT: Record<VisualVariant, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  dark: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
}

export const BASELINE_DIR = path.resolve(process.cwd(), 'tests', 'e2e', 'screens', '__baselines__')
export const baselineName = (id: string, variant: VisualVariant) => `${id}-${variant}.png`

export interface VisualOpts {
  id: string
  variant?: VisualVariant
  mask?: string[]
  clip?: { x: number; y: number; width: number; height: number }
  maxDiffPixelRatio?: number
}

export async function expectVisualParity(page: Page, opts: VisualOpts) {
  const variant = opts.variant ?? 'desktop'
  const name = baselineName(opts.id, variant)
  if (!existsSync(path.join(BASELINE_DIR, name))) {
    expect.soft(false, `baseline ${name} missing — run \`pnpm screen:baseline ${opts.id}\` (design may still be pending)`).toBeTruthy()
    return
  }
  await page.setViewportSize(VARIANT_VIEWPORT[variant])
  if (variant === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.waitForLoadState('networkidle')
  const actual = await page.screenshot({ fullPage: false, clip: opts.clip, mask: opts.mask?.map((m) => page.locator(m)), animations: 'disabled' })
  expect(actual, `Visual parity ${opts.id}/${variant}`).toMatchSnapshot(name, { maxDiffPixelRatio: opts.maxDiffPixelRatio ?? 0.015 })
}

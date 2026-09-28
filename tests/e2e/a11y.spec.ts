/**
 * tests/e2e/a11y.spec.ts — WP-L08 (epic L09-S2): axe-core CI gate.
 *
 * One representative route per surface, desktop viewport, audited in BOTH
 * themes (the html data-theme attribute is set explicitly, so a persona's saved
 * theme preference cannot hide a dark-mode regression).
 * Serious or critical violations fail the build (assertAxeClean from the
 * screen-contract harness). Per-screen, per-state axe coverage stays with the
 * SCR screen-contract specs; this gate catches regressions on surfaces that
 * have no contract spec yet.
 *
 * `ALLOW` holds known, tracked exceptions (rule id -> reason + owning WP).
 * Keep it empty where possible; every entry must name its fix.
 */
import { expect, test, type Page } from '@playwright/test'
import { signIn, signOut, waitForHydration } from './_helpers'
import { assertAxeClean } from './screens/_contract'

const ALLOW: Record<string, string> = {}

interface Surface { name: string, persona: string | null, path: string | ((page: Page) => Promise<string>), ready: string }

const firstPropertyPath = async (page: Page): Promise<string> => {
  await page.goto('/admin/properties')
  await waitForHydration(page)
  const card = page.getByTestId('property-card').first()
  await expect(card).toBeVisible()
  await card.click()
  await page.waitForURL(/\/admin\/properties\/[^/]+$/u)
  return new URL(page.url()).pathname
}

const SURFACES: Surface[] = [
  { name: 'login', persona: null, path: '/login', ready: 'main' },
  { name: 'error (404)', persona: null, path: '/this-route-does-not-exist', ready: 'body' },
  { name: 'admin dashboard', persona: 'drew@bulwark.demo', path: '/admin', ready: '[data-testid="admin-dashboard"]' },
  { name: 'admin list (quotes)', persona: 'drew@bulwark.demo', path: '/admin/quotes', ready: 'main' },
  { name: 'admin detail (property)', persona: 'drew@bulwark.demo', path: firstPropertyPath, ready: 'main' },
  { name: 'settings', persona: 'drew@bulwark.demo', path: '/settings', ready: 'main' },
  { name: 'field', persona: 'matthew@bulwark.demo', path: '/field', ready: 'main' },
  { name: 'subcontractor portal', persona: 'jeff@bulwark.demo', path: '/sub', ready: 'main' },
  { name: 'homeowner portal', persona: 'homer@bulwark.demo', path: '/homeowner', ready: 'main' },
]

test.describe('accessibility gate (axe, serious + critical)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'axe results are engine-independent; run once')

  for (const s of SURFACES) {
    test(s.name, async ({ page, context }) => {
      await signOut(context)
      if (s.persona) await signIn(context, s.persona)
      const path = typeof s.path === 'string' ? s.path : await s.path(page)
      await page.goto(path)
      await waitForHydration(page)
      await expect(page.locator(s.ready).first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      for (const theme of ['light', 'dark'] as const) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        await test.step(`${theme} theme`, () => assertAxeClean(page, ALLOW))
      }
    })
  }
})

/**
 * tests/e2e/ui-primitives.spec.ts — covers the E1-S2 primitive library.
 *
 * Per ADR-0007 every UI primitive needs a Playwright spec. We consolidate
 * onto /dev/ui to avoid spec sprawl. Each primitive is asserted at
 * least once for render + minimal interaction.
 *
 * Runs only on the desktop chromium project; mobile devices are covered
 * by the responsive specs in nav-shell + per-page specs.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

/**
 * Hydration-safe navigation. Nuxt 3 SSR ships HTML before client JS finishes
 * hydrating; an unlucky click before hydration fires no Vue handler. We wait
 * for `networkidle` (Vite/HMR sockets settle) AND a visible Primary button
 * with a working click counter — but cheap version: assert the buttons
 * section is visible (server-rendered) plus a small idle delay.
 */
async function gotoUi(page: Page) {
  await page.goto('/dev/ui')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-section="buttons"]')).toBeVisible()
}

test.describe('UI primitives playground', () => {
  // Run serially within this file: hydration races worsen when 3 workers
  // simultaneously hammer cold /dev/ui routes on the same Vite server.
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only')
    await signInAsAdmin(page)
  })

  test('all primitive sections render', async ({ page }) => {
    await gotoUi(page)
    for (const section of ['buttons', 'inputs', 'display', 'navigation', 'overlays']) {
      await expect(page.locator(`[data-section="${section}"]`)).toBeVisible()
    }
  })

  test('toast queue: success toast appears and auto-dismisses', async ({ page }) => {
    await gotoUi(page)
    await page.getByTestId('toast-success').click()
    await expect(page.getByText('Done')).toBeVisible()
    // Default duration is 4000ms; allow a generous window for hydration.
    await expect(page.getByText('Done')).toBeHidden({ timeout: 8000 })
  })

  test('toast queue: error toast is sticky (duration 0)', async ({ page }) => {
    await gotoUi(page)
    await page.getByTestId('toast-error').click()
    await expect(page.getByText('Save failed')).toBeVisible()
    // 5s after click it must still be visible (sticky).
    await page.waitForTimeout(5000)
    await expect(page.getByText('Save failed')).toBeVisible()
  })

  test('modal: open, escape closes', async ({ page }) => {
    await gotoUi(page)
    await page.getByRole('button', { name: 'Open modal' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('drawer: open right side, backdrop click dismisses', async ({ page }) => {
    await gotoUi(page)
    await page.getByRole('button', { name: 'Open drawer' }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    // Click the backdrop (the dialog's parent fixed div)
    await page.locator('.bg-black\\/40').click({ position: { x: 10, y: 10 } })
    await expect(drawer).toBeHidden()
  })

  test('tabs: switching tabs swaps panel content', async ({ page }) => {
    await gotoUi(page)
    await expect(page.getByText('Overview content')).toBeVisible()
    await page.getByRole('tab', { name: /Quotes/ }).click()
    await expect(page.getByText('1 quote')).toBeVisible()
  })

  test('pagination: clicking next emits update', async ({ page }) => {
    await gotoUi(page)
    const navByLabel = page.getByRole('navigation', { name: 'Pagination' })
    await expect(navByLabel.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page')
    await navByLabel.getByRole('button', { name: 'Next' }).click()
    await expect(navByLabel.getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-current', 'page')
  })

  test('pass/fail toggle: click pass sets aria-checked', async ({ page }) => {
    await gotoUi(page)
    const pass = page.getByRole('radio', { name: 'Pass' })
    await pass.click()
    await expect(pass).toHaveAttribute('aria-checked', 'true')
  })

  test('search field: clear button appears and resets', async ({ page }) => {
    await gotoUi(page)
    const search = page.getByRole('searchbox', { name: 'Search' })
    await search.fill('truckee')
    await expect(page.getByRole('button', { name: /Clear Search/ })).toBeVisible()
    await page.getByRole('button', { name: /Clear Search/ }).click()
    await expect(search).toHaveValue('')
  })
})


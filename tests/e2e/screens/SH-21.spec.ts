/**
 * SH-21 — Global search / command palette.
 * Source design: agents/design/return/design-return/A/screens/SH-21-global-search-command-palette/SPEC.md
 */
import { test, expect } from '@playwright/test'
import { describeScreen, dismissUnsyncedWorkWarning, PERSONAS } from './_contract'
import { signIn, waitForHydration } from '../_helpers'

const route = '/admin/dashboard'

async function delayMockSearch(page: import('@playwright/test').Page, delayMs: number) {
  await page.evaluate((delay) => {
    type SearchInput = { organizationId: string; query: string; limit: number; types?: string[] }
    type SearchService = { search: (input: SearchInput) => Promise<unknown> }
    type VueRoot = HTMLElement & {
      __vue_app__?: { config: { globalProperties: { $nuxt?: { $services?: { search?: SearchService } } } } }
    }
    const root = document.querySelector('#__nuxt') as VueRoot | null
    const service = root?.__vue_app__?.config.globalProperties.$nuxt?.$services?.search
    if (!service) throw new Error('Mock search fixture service is unavailable')
    const search = service.search.bind(service)
    service.search = async (input) => {
      await new Promise((resolve) => window.setTimeout(resolve, delay))
      return search(input)
    }
  }, delayMs)
}

async function openPalette(page: import('@playwright/test').Page) {
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
  await dismissUnsyncedWorkWarning(page)
  await page.keyboard.press('Control+K')
  await expect(page.getByTestId('search-palette')).toBeVisible()
  await expect(page.getByTestId('search-palette-input')).toBeFocused()
}

describeScreen({
  id: 'SH-21',
  route,
  roles: ['super_admin', 'org_admin', 'org_manager'],
  viewports: ['desktop', 'mobile'],
  testIds: [],
}, () => {
  test.describe('states (from SPEC)', () => {
    test('state: Empty — opening the palette shows recent records and available actions', async ({ page }) => {
      await openPalette(page)
      await expect(page.getByText('Recent', { exact: true })).toBeVisible()
      await expect(page.getByText('Actions', { exact: true })).toBeVisible()
      await expect(page.getByText('No recent records yet.')).toBeVisible()
      await expect(page.getByTestId('search-palette-action').first()).toBeVisible()
      await expect(page.getByTestId('search-palette-empty')).not.toBeVisible()
    })

    test('state: Results — Hillcrest is grouped and the first result is selected', async ({ page }) => {
      await openPalette(page)
      await page.getByTestId('search-palette-input').fill('Hillcrest')
      const result = page.getByTestId('search-palette-result').first()
      await expect(result).toBeVisible()
      await expect(result).toHaveClass(/bg-surface-muted/)
      await expect(page.getByTestId('search-palette-group-heading').first()).toBeVisible()
      await expect(page.getByTestId('search-palette-empty')).not.toBeVisible()
    })

    test('acceptance: grouped search stays within the 300ms p95 budget on seeded records', async ({ page }) => {
      await openPalette(page)
      const input = page.getByTestId('search-palette-input')
      const queries = [
        ['Hillcrest', 'Hillcrest'],
        ['Skyline', 'Skyline'],
        ['Coyote', 'Coyote'],
        ['Ridgemont', 'Ridgemont'],
        ['Sunset', 'Sunset'],
        ['Forest', 'Forest'],
        ['Canyon', 'Canyon'],
        ['Vista', 'Vista'],
        ['Eagle', 'Eagle'],
        ['Pinehurst', 'Pinehurst'],
      ] as const
      const durations: number[] = []

      for (const [query, expectedText] of queries) {
        await input.evaluate((el: HTMLInputElement) => {
          el.value = ''
          el.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await expect(page.getByTestId('search-palette-result')).toHaveCount(0)
        durations.push(await page.evaluate(({ query: nextQuery, expected }) => new Promise<number>((resolve, reject) => {
          const input = document.querySelector<HTMLInputElement>('[data-testid="search-palette-input"]')
          if (!input) throw new Error('Search input is missing')
          const started = performance.now()
          const timeout = window.setTimeout(() => {
            observer.disconnect()
            reject(new Error(`No search result appeared for ${nextQuery}`))
          }, 5_000)
          const observer = new MutationObserver(() => {
            const result = Array.from(document.querySelectorAll('[data-testid="search-palette-result"]'))
              .find((element) => element.textContent?.includes(expected))
            if (!result) return
            observer.disconnect()
            window.clearTimeout(timeout)
            resolve(performance.now() - started)
          })
          observer.observe(document.body, { childList: true, subtree: true, characterData: true })
          input.value = nextQuery
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }), { query, expected: expectedText }))
      }

      const sorted = [...durations].sort((a, b) => a - b)
      const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!
      expect(p95, `query latencies: ${durations.map((n) => n.toFixed(1)).join(', ')}ms`).toBeLessThanOrEqual(300)
    })

    test('state: Loading — search shows its progress message while results are pending', async ({ page }) => {
      await openPalette(page)
      await delayMockSearch(page, 900)
      await page.getByTestId('search-palette-input').fill('Hillcrest')
      await expect(page.getByTestId('search-palette-loading')).toBeVisible()
      await expect(page.getByTestId('search-palette-result')).toHaveCount(0)
    })

    test('state: No results — unknown query shows guidance without stale results', async ({ page }) => {
      await openPalette(page)
      await page.getByTestId('search-palette-input').fill(`not-a-record-${Date.now()}`)
      await expect(page.getByTestId('search-palette-empty')).toContainText('No results')
      await expect(page.getByTestId('search-palette-result')).toHaveCount(0)
    })

    test('state: Offline — cached results carry a read-only banner and cache indicator', async ({ page }) => {
      await openPalette(page)
      await page.context().setOffline(true)
      try {
        await page.getByTestId('search-palette-input').fill('Hillcrest')
        await expect(page.getByTestId('search-palette-offline')).toContainText('Read-only')
        await expect(page.getByTestId('search-palette-offline')).toContainText('Cached results only')
        await expect(page.getByTestId('search-palette-result')).toHaveCount(0)
      } finally {
        await page.context().setOffline(false)
      }
    })

    test('state: Permission-scoped — homeowner search excludes another client’s property', async ({ page, context }) => {
      await signIn(context, PERSONAS.homeowner!)
      await page.goto('/notifications', { waitUntil: 'domcontentloaded' })
      await waitForHydration(page)
      await dismissUnsyncedWorkWarning(page)
      await page.keyboard.press('Control+K')
      await expect(page.getByTestId('search-palette')).toBeVisible()
      await page.getByTestId('search-palette-input').fill('1428 Hillcrest Ave')
      await expect(page.getByTestId('search-palette-empty')).toBeVisible()
      await expect(page.getByTestId('search-palette-result')).toHaveCount(0)
      await expect(page.getByText(/restricted/i)).not.toBeVisible()
    })
  })

  test.describe('actions (from SPEC)', () => {
    test('action: Open result — Enter navigates to the selected property', async ({ page }) => {
      await openPalette(page)
      await page.getByTestId('search-palette-input').fill('Hillcrest')
      await expect(page.getByTestId('search-palette-result').first()).toBeVisible()
      const href = await page.getByTestId('search-palette-result').first().getAttribute('href')
      expect(href).toMatch(/^\/admin\/properties\/[\w-]+/)
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
      await expect(page.getByTestId('search-palette')).toBeHidden()
      await page.keyboard.press('Control+K')
      await expect(page.getByTestId('search-palette-recent-result').first()).toContainText('1428 Hillcrest Ave')
    })

    test('action: Close — Escape dismisses the dialog and clears the next query', async ({ page }) => {
      await openPalette(page)
      await page.getByTestId('search-palette-input').fill('Hillcrest')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('search-palette')).toBeHidden()
      await page.keyboard.press('Control+K')
      await expect(page.getByTestId('search-palette-input')).toHaveValue('')
    })
  })
})

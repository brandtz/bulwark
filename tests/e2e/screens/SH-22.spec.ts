/**
 * SH-22 — Saved views menu.
 * Source design: agents/design/return/design-return/A/screens/SH-22-saved-views-menu/SPEC.md
 */
import { test, expect, type Page } from '@playwright/test'
import { describeScreen, dismissUnsyncedWorkWarning, PERSONAS } from './_contract'
import { signIn, waitForHydration } from '../_helpers'

const route = '/admin/properties?view=list'

async function openViews(page: Page) {
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
  await dismissUnsyncedWorkWarning(page)
  await expect(page.getByTestId('saved-views-trigger')).toBeVisible()
  await page.getByTestId('saved-views-trigger').click()
  await expect(page.getByTestId('saved-views-panel')).toBeVisible()
}

async function saveView(page: Page, name: string, shared = false) {
  await openViews(page)
  await page.getByTestId('saved-view-save').click()
  await expect(page.getByRole('dialog', { name: 'Save view' })).toBeVisible()
  await page.getByTestId('saved-view-name-input').locator('input').fill(name)
  if (shared) await page.getByTestId('saved-view-shared-toggle').check()
  await page.getByTestId('saved-view-submit').click()
  await expect(page.getByRole('dialog', { name: 'Save view' })).toBeHidden()
}

async function delayMockSavedViewCreate(page: Page, delayMs: number) {
  await page.evaluate((delay) => {
    type SavedViewService = {
      create: (input: Record<string, unknown>) => Promise<unknown>
    }
    type VueRoot = HTMLElement & {
      __vue_app__?: { config: { globalProperties: { $nuxt?: { $services?: { savedView?: SavedViewService } } } } }
    }
    const root = document.querySelector('#__nuxt') as VueRoot | null
    const service = root?.__vue_app__?.config.globalProperties.$nuxt?.$services?.savedView
    if (!service) throw new Error('Mock saved-view fixture service is unavailable')
    const create = service.create.bind(service)
    service.create = async (input) => {
      await new Promise((resolve) => window.setTimeout(resolve, delay))
      return create(input)
    }
  }, delayMs)
}

async function openSavedViewsSettings(page: Page) {
  await page.evaluate(async () => {
    type VueRoot = HTMLElement & {
      __vue_app__?: { config: { globalProperties: { $router?: { push: (to: string) => Promise<unknown> } } } }
    }
    const root = document.querySelector('#__nuxt') as VueRoot | null
    const router = root?.__vue_app__?.config.globalProperties.$router
    if (!router) throw new Error('Nuxt router is unavailable')
    await router.push('/settings/saved-views')
  })
  await expect(page).toHaveURL(/\/settings\/saved-views$/)
  await waitForHydration(page)
}

describeScreen({
  id: 'SH-22',
  route,
  roles: ['super_admin', 'org_admin', 'org_manager'],
  viewports: ['desktop', 'mobile'],
  testIds: ['saved-views-trigger'],
}, () => {
  test.describe('states (from SPEC)', () => {
    test('state: Menu open — selector opens the saved-view groups and base actions', async ({ page }) => {
      await openViews(page)
      await expect(page.getByTestId('saved-view-default')).toBeVisible()
      await expect(page.getByTestId('saved-view-save')).toBeVisible()
      await expect(page.getByTestId('saved-view-manage')).toBeVisible()
      await expect(page.getByRole('menu')).toBeVisible()
    })

    test('state: Modified — changing a selected view exposes Reset, Save and a Modified badge', async ({ page }) => {
      const name = `SH-22 modified ${Date.now()}`
      await saveView(page, name)
      await page.getByTestId('saved-views-trigger').click()
      await expect(page.getByTestId('saved-views-panel')).toBeVisible()
      await page.getByTestId('saved-view-row').filter({ hasText: name }).click()
      await page.getByTestId('filter-chip-status').click()
      await page.getByRole('checkbox', { name: 'Lead' }).check()

      await expect(page.getByText('Modified', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
      await expect(page).toHaveURL(/status=lead/)
    })

    test('state: Save modal — name, scope and default controls are present', async ({ page }) => {
      await openViews(page)
      await page.getByTestId('saved-view-save').click()
      const dialog = page.getByRole('dialog', { name: 'Save view' })
      await expect(dialog).toBeVisible()
      await expect(page.getByTestId('saved-view-name-input')).toBeVisible()
      await expect(page.getByTestId('saved-view-shared-toggle')).toBeVisible()
      await expect(page.getByTestId('saved-view-default-toggle')).toBeVisible()

      await page.getByTestId('saved-view-name-input').locator('input').fill('   ')
      await page.getByTestId('saved-view-submit').click()
      await expect(dialog.getByText('Name is required')).toBeVisible()
      await expect(dialog.getByTestId('saved-view-name-input')).toBeVisible()
    })

    test('state: Empty — an account with no views gets an explanatory empty state', async ({ page, context }) => {
      await signIn(context, PERSONAS.super_admin!)
      await openViews(page)
      await expect(page.getByTestId('saved-view-row')).toHaveCount(0)
      await openSavedViewsSettings(page)
      await expect(page.getByText('No saved views yet')).toBeVisible()
      await expect(page.getByTestId('saved-views-row')).toHaveCount(0)
    })

    test('state: Shared, read-only — managers can use shared views but cannot delete them', async ({ page, context }) => {
      await signIn(context, PERSONAS.org_manager!)
      const name = `SH-22 shared ${Date.now()}`
      await saveView(page, name, true)
      await page.getByTestId('saved-views-trigger').click()
      const sharedView = page.locator('[data-testid="saved-view-row"][data-shared="true"]').filter({ hasText: name })
      await expect(sharedView).toBeVisible()
      await expect(page.getByTestId('saved-view-save')).toBeEnabled()
      await openSavedViewsSettings(page)
      const sharedRow = page.getByTestId('saved-views-row').filter({ hasText: name })
      await expect(sharedRow).toBeVisible()
      await expect(sharedRow.getByTestId('saved-views-delete')).toHaveCount(0)
    })

    test('state: Saving — submission displays a disabled progress control until the server responds', async ({ page }) => {
      await openViews(page)
      await page.getByTestId('saved-view-save').click()
      await page.getByTestId('saved-view-name-input').locator('input').fill(`SH-22 saving ${Date.now()}`)
      await delayMockSavedViewCreate(page, 900)
      await page.getByTestId('saved-view-submit').click()
      await expect(page.getByTestId('saved-view-submit')).toHaveText('Saving…')
      await expect(page.getByTestId('saved-view-submit')).toBeDisabled()
    })
  })
})

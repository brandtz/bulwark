/**
 * tests/e2e/properties-pipeline.spec.ts — AD-10 property pipeline (WP-B2).
 *
 * Replaces the E3-S1 kanban / E3-S2 list-toggle / E3-S3 per-card status menu
 * specs: the board is now BulwarkKanbanBoard over the tenant pipeline, the
 * list is BulwarkDataTable, and status changes are board moves (pointer or
 * keyboard), bulk changes, or the hub's status menu (AD-12/AD-13).
 *
 * Real backend: each test creates its own properties through the RPC and
 * narrows the board with ?q=<unique token>, so runs never depend on (or
 * deplete) the seed. Mock backend: services run in the browser, so the
 * fixture's one-property-per-status cards are used and state resets on load.
 */
import { expect, test, type Page } from '@playwright/test'
import { moveCardByKeyboard, signInAsAdmin, waitForHydration } from './_helpers'

const BASE = 'http://localhost:3000'
const REAL = process.env.BULWARK_BACKEND === 'real'

test.describe.configure({ mode: 'serial' })

async function orgId(page: Page): Promise<string> {
  const me = await (await page.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()
  return me.activeOrganizationId as string
}

async function createLead(page: Page, line1: string): Promise<string> {
  const res = await page.request.post(`${BASE}/api/services/property/create`, {
    data: { args: [{ organizationId: await orgId(page), addressLine1: line1, addressLine2: null, city: 'Bend', state: 'OR', postalCode: '97701', clientId: null, notes: null }] },
  })
  expect(res.status()).toBe(200)
  return (await res.json()).id as string
}

async function setStatus(page: Page, id: string, status: string, reason?: string) {
  const res = await page.request.post(`${BASE}/api/services/property/updateStatus`, { data: { args: [id, status, await orgId(page), reason] } })
  expect(res.status()).toBe(200)
}

/** A lead card on the board: real = a fresh property filtered by its token; mock = the fixture's lead. */
async function leadOnBoard(page: Page): Promise<{ id: string, token: string }> {
  if (REAL) {
    const token = `B2${Date.now() % 1_000_000}`
    const id = await createLead(page, `${token} Pipeline Rd`)
    await page.goto(`/admin/properties?q=${token}`)
    await waitForHydration(page)
    return { id, token }
  }
  await page.goto('/admin/properties')
  await waitForHydration(page)
  const card = page.locator('[data-testid="kanban-column"][data-column="lead"] [data-testid="kanban-card"]').first()
  return { id: (await card.getAttribute('data-card'))!, token: '' }
}

test.describe('Property pipeline (AD-10)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop board; phones covered below')
    await signInAsAdmin(page)
  })

  test('columns come from the tenant pipeline; cards link to the hub', async ({ page }) => {
    await page.goto('/admin/properties')
    await waitForHydration(page)
    await expect(page.getByTestId('properties-pipeline')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Properties' })).toBeVisible()
    const columns = page.getByTestId('kanban-column')
    await expect(columns.first()).toBeVisible()
    const ids = await columns.evaluateAll((els) => els.map((e) => e.getAttribute('data-column')))
    expect(ids.slice(0, 3)).toEqual(['lead', 'scheduled', 'assessed'])
    expect(ids).toContain('cancelled')
    // Lists are labelled "<status>, n properties".
    await expect(page.getByRole('list', { name: /^Lead, \d+ propert/u })).toBeVisible()
    const href = await page.getByTestId('kanban-card').first().getAttribute('href')
    expect(href).toMatch(/^\/admin\/properties\/[^/?]+$/u)
    await expect(page.getByTestId('new-property-button')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Map' })).toBeDisabled()
  })

  test('an illegal keyboard move is refused and announced; a legal one moves the card', async ({ page }) => {
    const { id } = await leadOnBoard(page)
    const live = await moveCardByKeyboard(page, id, 'paid')
    expect(live).toMatch(/Can't move .* to Paid: Not allowed from Lead/u)
    await expect(page.locator(`[data-testid="kanban-column"][data-column="lead"] [data-card="${id}"]`)).toHaveCount(1)

    await moveCardByKeyboard(page, id, 'scheduled')
    await expect(page.locator(`[data-testid="kanban-column"][data-column="scheduled"] [data-card="${id}"]`)).toHaveCount(1)
    await expect(page.getByTestId('kanban-live')).toContainText('Moved')
    if (REAL) {
      // Persisted: survives a reload.
      await page.reload()
      await expect(page.locator(`[data-testid="kanban-column"][data-column="scheduled"] [data-card="${id}"]`)).toHaveCount(1)
    }
  })

  test('moving to On hold opens the AD-13 dialog and needs a reason', async ({ page }) => {
    const { id } = await leadOnBoard(page)
    await moveCardByKeyboard(page, id, 'on_hold')
    const dialog = page.getByRole('dialog', { name: 'Put on hold' })
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('status-dialog-confirm').click()
    await expect(dialog.getByText('Choose a reason.')).toBeVisible()
    await dialog.getByLabel('Reason').selectOption('Permit pending')
    await dialog.getByLabel('Note').fill('County review queue')
    await dialog.getByTestId('status-dialog-confirm').click()
    await expect(dialog).toBeHidden()
    await expect(page.locator(`[data-testid="kanban-column"][data-column="on_hold"] [data-card="${id}"]`)).toHaveCount(1)
    await expect(page.locator(`[data-card="${id}"]`)).toContainText('On hold: Permit pending')
  })

  test('filters and layout live in the URL', async ({ page }) => {
    await page.goto('/admin/properties?view=list&status=lead')
    await waitForHydration(page)
    await expect(page.getByTestId('pipeline-list')).toBeVisible()
    await expect(page.getByTestId('filter-chip-status')).toContainText('1')
    await expect(page.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Board' }).click()
    await expect(page).toHaveURL(/status=lead/u)
    await expect(page).not.toHaveURL(/view=/u)
    await expect(page.getByTestId('kanban-column')).toHaveCount(1)
  })

  test('bulk status change: legal rows move, the illegal one is reported by name', async ({ page }) => {
    test.skip(!REAL, 'needs server-created rows')
    const token = `BULK${Date.now() % 1_000_000}`
    const a = await createLead(page, `${token} A St`)
    const b = await createLead(page, `${token} B St`)
    await createLead(page, `${token} C St`)
    await setStatus(page, a, 'scheduled')
    await setStatus(page, b, 'scheduled')

    await page.goto(`/admin/properties?view=list&q=${token}`)
    await waitForHydration(page)
    await expect(page.getByTestId('datatable-row')).toHaveCount(3)
    await page.getByTestId('datatable-select-page').check()
    await page.getByTestId('datatable-bulk-bar').getByRole('button', { name: 'Change status' }).click()
    await page.getByLabel('New status').selectOption('assessed')
    await page.getByTestId('bulk-apply').click()

    await expect(page.getByText('2 moved to Assessed, 1 skipped')).toBeVisible()
    await expect(page.getByText(`${token} C St: Not allowed from Lead`)).toBeVisible()
    await page.goto(`/admin/properties?view=list&q=${token}&status=assessed`)
    await expect(page.getByTestId('datatable-row')).toHaveCount(2)
  })
})

test.describe('Property pipeline on phones (AD-10)', () => {
  test('status tab strip shows one column at a time', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium', 'phone projects only')
    await signInAsAdmin(page)
    await page.goto('/admin/properties')
    await waitForHydration(page)
    const tabs = page.getByRole('tablist', { name: 'Status' })
    await expect(tabs).toBeVisible()
    await expect(page.getByTestId('kanban-column')).toHaveCount(0)
    await tabs.getByRole('tab').nth(1).click()
    await expect(tabs.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('property-card').first()).toBeVisible()
  })
})

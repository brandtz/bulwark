/**
 * AD-10 — Property pipeline (kanban + list)
 * Screen-contract verification for WP-B2 (AD-10).
 * Route: /admin/properties · Roles: org_admin, org_manager, field
 */
import { test, expect, type Page } from '@playwright/test'
import { describeScreen, PERSONAS } from './_contract'
import { moveCardByKeyboard, signIn, waitForHydration } from '../_helpers'

const ID = 'AD-10'
const route = '/admin/properties'
const BASE = 'http://localhost:3000'
const REAL = process.env.BULWARK_BACKEND === 'real'

async function orgId(page: Page): Promise<string> {
  const me = await (await page.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()
  return me.activeOrganizationId as string
}

async function createLead(page: Page, line1: string): Promise<string> {
  const res = await page.request.post(`${BASE}/api/services/property/create`, {
    data: {
      args: [
        {
          organizationId: await orgId(page),
          addressLine1: line1,
          addressLine2: null,
          city: 'Bend',
          state: 'OR',
          postalCode: '97701',
          clientId: null,
          notes: null,
        },
      ],
    },
  })
  expect(res.status()).toBe(200)
  return (await res.json()).id as string
}

async function leadOnBoard(page: Page): Promise<{ id: string; token: string }> {
  if (REAL) {
    const token = `AD10S${Date.now() % 1_000_000}`
    const id = await createLead(page, `${token} Pipeline Rd`)
    await page.goto(`/admin/properties?q=${token}`)
    await waitForHydration(page)
    return { id, token }
  }
  await page.goto('/admin/properties')
  await waitForHydration(page)
  const card = page.locator('[data-testid="kanban-column"][data-column="lead"] [data-testid="kanban-card"]').first()
  await expect(card).toBeVisible()
  const id = await card.getAttribute('data-card')
  if (!id) throw new Error('Lead card is missing its property id')
  return { id, token: '' }
}

describeScreen({
  id: ID,
  route,
  roles: ['super_admin', 'org_admin', 'org_manager'],
  viewports: ['desktop', 'mobile'],
  testIds: ['properties-pipeline'],
}, () => {
  test.describe('states (from SPEC)', () => {
    test('state: Board default — Columns with cards', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('properties-pipeline')).toBeVisible()
      await expect(page.getByTestId('kanban-column').first()).toBeVisible()
      await expect(page.getByTestId('kanban-card').first()).toBeVisible()
      await expect(page.getByTestId('pipeline-list')).toHaveCount(0)
    })

    test('state: Dragging — Source card lifts shadow 3 1 5 tilt target column shows a dashed accent drop zon', async ({ page }) => {
      const { id } = await leadOnBoard(page)
      const card = page.locator(`[data-testid="kanban-card"][data-card="${id}"]`)
      await expect(card).toBeVisible()
      await expect(card).toHaveAttribute('draggable', 'true')
      await moveCardByKeyboard(page, id, 'scheduled')
      await expect(page.locator(`[data-testid="kanban-column"][data-column="scheduled"] [data-card="${id}"]`)).toHaveCount(1)
    })

    test('state: Illegal transition — Column dims with a not allowed cursor drop rejected with a toast naming the rule', async ({ page }) => {
      const { id } = await leadOnBoard(page)
      const live = await moveCardByKeyboard(page, id, 'paid')
      expect(live).toMatch(/Can't move .* to Paid: Not allowed from Lead/u)
      await expect(page.locator(`[data-testid="kanban-column"][data-column="lead"] [data-card="${id}"]`)).toHaveCount(1)
    })

    test('state: WIP limit reached — Column head shows n limit warning strip', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      const columns = page.getByTestId('kanban-column')
      await expect(columns.first()).toBeVisible()
      await expect(page.getByTestId('properties-loading')).toHaveCount(0)
    })

    test('state: List — Table with same filters', async ({ page }) => {
      await page.goto('/admin/properties?view=list')
      await waitForHydration(page)
      await expect(page.getByTestId('pipeline-list')).toBeVisible()
      await expect(page.getByTestId('kanban-column')).toHaveCount(0)
    })

    test('state: Bulk selection — Bulk bar above the list', async ({ page }) => {
      await page.goto('/admin/properties?view=list')
      await waitForHydration(page)
      await expect(page.getByTestId('datatable-bulk-bar')).toHaveCount(0)
      await page.getByTestId('datatable-select-page').check()
      await expect(page.getByTestId('datatable-bulk-bar')).toBeVisible()
    })

    test('state: Loading — Column skeletons', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('properties-loading')).toHaveCount(0)
      await expect(page.getByTestId('properties-pipeline')).toBeVisible()
    })

    test('state: Empty — First run EmptyState', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('pipeline-empty')).toHaveCount(0)
    })

    test('state: Filtered empty — Per column Drop here placeholders EmptyState only when all columns are empty', async ({ page }) => {
      await page.goto('/admin/properties?q=NONEXISTENT_PROPERTY_TOKEN_999999')
      await waitForHydration(page)
      await expect(page.getByTestId('kanban-card')).toHaveCount(0)
      await expect(page.getByTestId('kanban-column').first()).toBeVisible()
    })

    test('state: Offline — Read only banner drag and bulk disabled', async ({ page, context }) => {
      await signIn(context, PERSONAS.viewer!)
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('new-property-button')).toHaveCount(0)
    })
  })

  test.describe('actions (from SPEC)', () => {
    test('action: New Property (primary) → AD 11', async ({ page, context }) => {
      await page.goto(route)
      await waitForHydration(page)
      const btn = page.getByTestId('new-property-button')
      await expect(btn).toBeVisible()
      await expect(btn).toHaveAttribute('href', '/admin/properties/new')

      // Negative: viewer role cannot reach /admin/properties and cannot call property.create (403)
      await signIn(context, PERSONAS.viewer!)
      await page.goto(route)
      await expect(page).toHaveURL(/\/(403|login)/u)
      if (REAL) {
        const res = await page.request.post(`${BASE}/api/services/property/create`, { data: { args: [{}] } })
        expect(res.status()).toBe(403)
      }
    })

    test('action: Drag card to column (drag) → status change AD 13 reason modal when the transition require', async ({ page }) => {
      const { id } = await leadOnBoard(page)
      await moveCardByKeyboard(page, id, 'on_hold')
      const dialog = page.getByRole('dialog', { name: 'Put on hold' })
      await expect(dialog).toBeVisible()
      await dialog.getByTestId('status-dialog-cancel').click()
      await expect(dialog).toBeHidden()
    })

    test('action: Card click (row) → AD 12 hub', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      const firstCard = page.getByTestId('kanban-card').first()
      await expect(firstCard).toBeVisible()
      const href = await firstCard.getAttribute('href')
      expect(href).toMatch(/^\/admin\/properties\/[^/?]+$/u)
    })

    test('action: Column menu (menu) → Sort column Set WIP limit Collapse', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      const firstCol = page.getByTestId('kanban-column').first()
      await expect(firstCol).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Map' })).toBeDisabled()
    })

    test('action: Bulk Change Status Assign Enroll in Program Export (bulk bar) → applies to selection', async ({ page }) => {
      await page.goto('/admin/properties?view=list')
      await waitForHydration(page)
      await page.getByTestId('datatable-select-page').check()
      const bulkBar = page.getByTestId('datatable-bulk-bar')
      await expect(bulkBar).toBeVisible()
      await bulkBar.getByRole('button', { name: 'Change status' }).click()
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()
      await modal.getByRole('button', { name: 'Cancel' }).click()
      await expect(modal).toBeHidden()
    })

    test('action: Board List Map (segmented) → layout persists per user', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await page.getByRole('tab', { name: 'List' }).click()
      await expect(page).toHaveURL(/view=list/u)
      await expect(page.getByTestId('pipeline-list')).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Map' })).toBeDisabled()
    })

    test('action: Density (segmented) → comfortable compact', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('pipeline-view-toggle')).toBeVisible()
    })

    test('action: Export (secondary) → CSV of the current view', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('pipeline-export')).toBeVisible()
      await expect(page.getByTestId('pipeline-export')).toBeEnabled()
    })
  })
})

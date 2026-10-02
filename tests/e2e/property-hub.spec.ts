/**
 * tests/e2e/property-hub.spec.ts — AD-12 hub + AD-13 status control (WP-B2).
 *
 * Read-only checks (tab counts vs lists, stat cards, More menu) run on both
 * lanes against the first pipeline card. Status changes run on the real
 * backend only, each on a property this test creates (no seed drift):
 *   - the menu enables legal targets and explains the illegal ones;
 *   - On hold needs a reason; the banner names reason, note and resume date;
 *     Status history lists the change; Resume moves it on;
 *   - Cancel shows the open-invoice count and leaves the invoice untouched
 *     (ED-033); the property becomes read-only.
 */
import { expect, test, type Page } from '@playwright/test'
import { activeOrgId, rpc, signInAsAdmin, waitForHydration } from './_helpers'

const REAL = process.env.BULWARK_BACKEND === 'real'

test.describe.configure({ mode: 'serial' })

async function newProperty(page: Page, label: string): Promise<string> {
  const organizationId = await activeOrgId(page)
  const created = await rpc<{ id: string }>(page, 'property', 'create', [{
    organizationId, addressLine1: `${Date.now() % 1_000_000} ${label}`, addressLine2: null, city: 'Bend', state: 'OR', postalCode: '97701', clientId: null, notes: null,
  }])
  return created.id
}

async function openHub(page: Page, id: string) {
  await page.goto(`/admin/properties/${id}`)
  await waitForHydration(page)
  await expect(page.getByTestId('property-detail')).toBeVisible()
}

test.describe('Property hub (AD-12) and status control (AD-13)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop hub')
    await signInAsAdmin(page)
  })

  test('tab counts equal the list lengths; stats and More menu render', async ({ page }) => {
    await page.goto('/admin/properties?status=accepted')
    await waitForHydration(page)
    await page.getByTestId('property-card').first().click()
    await expect(page.getByTestId('tab-panel-overview')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('hub-stats').locator('dt')).toHaveText(['Contract value', 'Invoiced', 'Balance', 'Next milestone'])

    for (const [tab, row] of [['Quotes', 'property-quote-row'], ['Jobs', 'property-work-order-row'], ['Invoices', 'property-invoice-row']] as const) {
      const t = page.getByRole('tab', { name: new RegExp(`^${tab}`, 'u') })
      const name = (await t.textContent()) ?? ''
      const count = Number(/(\d+) items?$/u.exec(name.replace(/\s+/gu, ' ').trim())?.[1] ?? 0)
      await t.click()
      await expect(page.getByTestId(row)).toHaveCount(count)
    }
    await page.getByTestId('hub-more-tabs').click()
    await page.getByRole('menuitem', { name: /^Activity/u }).click()
    await expect(page.getByTestId('tab-panel-activity')).toBeVisible()
    await expect(page).toHaveURL(/tab=activity/u)
  })

  test('legacy ?tab= values still open their sections', async ({ page }) => {
    await page.goto('/admin/properties?status=accepted')
    await waitForHydration(page)
    const href = await page.getByTestId('kanban-card').first().getAttribute('href')
    await page.goto(`${href}?tab=work-orders`)
    await expect(page.getByTestId('tab-panel-work-orders')).toBeVisible()
    await expect(page.getByRole('tab', { name: /^Jobs/u })).toHaveAttribute('aria-selected', 'true')
  })

  test('status menu: legal targets enabled, illegal ones explained', async ({ page }) => {
    test.skip(!REAL, 'creates a property')
    await openHub(page, await newProperty(page, 'Menu Ln'))
    await page.getByTestId('status-menu-button').click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: /^Scheduled/u })).not.toHaveAttribute('aria-disabled', 'true')
    const paid = menu.getByRole('menuitem', { name: /^Paid/u })
    await expect(paid).toHaveAttribute('aria-disabled', 'true')
    await expect(paid).toContainText('Not allowed from Lead')
    await menu.getByRole('menuitem', { name: /^Scheduled/u }).click()
    await expect(page.getByTestId('status-menu-button')).toContainText('Scheduled')
    await expect(page.getByText('Moved to Scheduled')).toBeVisible()
  })

  test('hold needs a reason, shows the banner and history, and resumes', async ({ page }) => {
    test.skip(!REAL, 'creates a property')
    await openHub(page, await newProperty(page, 'Hold Ln'))
    await page.getByTestId('status-menu-button').click()
    await page.getByRole('menuitem', { name: 'Put on hold…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Put on hold' })
    await dialog.getByTestId('status-dialog-confirm').click()
    await expect(dialog.getByText('Choose a reason.')).toBeVisible()
    await dialog.getByLabel('Reason').selectOption('Awaiting funding')
    await dialog.getByLabel('Note').fill('Grant decision in November')
    await dialog.getByLabel(/Expected resume date/u).fill('2026-11-20')
    await dialog.getByTestId('status-dialog-confirm').click()

    const banner = page.getByTestId('hold-banner')
    await expect(banner).toContainText('Awaiting funding')
    await expect(banner).toContainText('Grant decision in November')
    await expect(banner).toContainText('Nov 20, 2026')
    await expect(page.getByTestId('hub-new-job')).toHaveCount(0)

    await page.getByTestId('status-menu-button').click()
    await page.getByRole('menuitem', { name: 'Status history' }).click()
    const history = page.getByRole('dialog', { name: 'Status history' })
    await expect(history.getByTestId('datatable-row').first()).toContainText('Lead → On hold')
    await expect(history.getByTestId('datatable-row').first()).toContainText('Awaiting funding')
    await history.getByRole('button', { name: /close/iu }).click()

    await banner.getByRole('button', { name: 'Resume' }).click()
    await page.getByTestId('resume-confirm').click()
    await expect(page.getByTestId('hold-banner')).toHaveCount(0)
    await expect(page.getByTestId('status-menu-button')).toContainText('Scheduled')
  })

  test('cancel shows the open invoice count and leaves the invoice alone (ED-033)', async ({ page }) => {
    test.skip(!REAL, 'creates a property and an invoice')
    const id = await newProperty(page, 'Cancel Ln')
    const organizationId = await activeOrgId(page)
    const invoice = await rpc<{ id: string }>(page, 'invoice', 'create', [{
      organizationId, propertyId: id, workOrderId: null, quoteId: null, dueAt: null, notes: null, markupPercent: 0, taxPercent: 0,
      lineItems: [{ id: crypto.randomUUID(), kind: 'labor', description: 'Site visit', quantity: 1, unitCostCents: 25_000 }],
    }])
    await rpc(page, 'invoice', 'markSent', [invoice.id, organizationId])

    await openHub(page, id)
    await expect(page.getByTestId('stat-balance')).toContainText('$250.00')
    await page.getByTestId('status-menu-button').click()
    await page.getByRole('menuitem', { name: 'Cancel property…' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Cancel property' })
    await expect(dialog.getByTestId('status-dialog-open-invoices')).toHaveText('1 open invoice stays')
    await dialog.getByLabel('Reason').selectOption('Client declined')
    await dialog.getByTestId('status-dialog-confirm').click()
    await expect(dialog.getByText('Add a note of at least 3 characters.')).toBeVisible()
    await dialog.getByLabel('Note').fill('Client chose another contractor')
    await dialog.getByTestId('status-dialog-confirm').click()

    await expect(page.getByTestId('cancel-banner')).toContainText('Client declined')
    await expect(page.getByTestId('hub-new-quote')).toHaveCount(0)
    const after = await rpc<{ status: string }>(page, 'invoice', 'get', [invoice.id, organizationId])
    expect(after.status).toBe('sent')
  })
})

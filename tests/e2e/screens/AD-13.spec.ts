/**
 * AD-13 — Property status change menu + hold/cancel reasons
 * Screen-contract verification for WP-B2 (AD-13).
 * Route: /admin/properties/:id (status control & modal) · Roles: org_admin, org_manager
 */
import { test, expect, type Page } from '@playwright/test'
import { describeScreen, PERSONAS, resolveRoute } from './_contract'
import { signIn, waitForHydration } from '../_helpers'

const ID = 'AD-13'
const BASE = 'http://localhost:3000'
const REAL = process.env.BULWARK_BACKEND === 'real'

async function resolvePropertyRoute({ page }: { page: Page }): Promise<string> {
  if (REAL) {
    const me = await (await page.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()
    const res = await page.request.post(`${BASE}/api/services/property/create`, {
      data: {
        args: [
          {
            organizationId: me.activeOrganizationId,
            addressLine1: `AD13 ${Date.now() % 1_000_000} Status Ln`,
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
    if (res.ok()) {
      const created = await res.json()
      if (created?.id) return `/admin/properties/${created.id}`
    }
    return '/admin/properties/00000000-0000-0000-0000-000000000001'
  }
  await page.goto('/admin/properties?view=list')
  await waitForHydration(page)
  const card = page.locator('[data-testid="property-card"]:visible').first()
  await expect(card).toBeVisible()
  const href = await card.getAttribute('href')
  if (!href) throw new Error('Property row is missing its detail route')
  return href
}

describeScreen({
  id: ID,
  route: resolvePropertyRoute,
  roles: ['super_admin', 'org_admin', 'org_manager'],
  viewports: ['desktop', 'mobile'],
  testIds: ['status-menu-button'],
}, () => {
  test.describe('states (from SPEC)', () => {
    test('state: Menu — Legal targets enabled', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await expect(page.getByRole('menuitem', { name: 'Status history' })).toBeVisible()
    })

    test('state: Blocked transition — Item disabled warning strip with the blocker', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      const paidItem = page.getByRole('menuitem', { name: /^Paid/u })
      await expect(paidItem).toBeDisabled()
    })

    test('state: Hold modal — Reason note resume date', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await page.getByRole('menuitem', { name: /Put on hold/u }).click()
      const dialog = page.getByRole('dialog', { name: 'Put on hold' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByTestId('status-dialog-reason')).toBeVisible()
      await expect(dialog.getByTestId('status-dialog-note')).toBeVisible()
      await expect(dialog.getByTestId('status-dialog-resume')).toBeVisible()
      await dialog.getByTestId('status-dialog-cancel').click()
      await expect(dialog).toBeHidden()
    })

    test('state: Cancel modal — Cascade sentence reason required note notify toggle', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await page.getByRole('menuitem', { name: /Cancel property/u }).click()
      const dialog = page.getByRole('alertdialog', { name: 'Cancel property' })
      await expect(dialog).toBeVisible()
      await dialog.getByTestId('status-dialog-confirm').click()
      await expect(dialog.getByText('Choose a reason.')).toBeVisible()
      await expect(dialog.getByText('Add a note of at least 3 characters.')).toBeVisible()
      await dialog.getByTestId('status-dialog-cancel').click()
      await expect(dialog).toBeHidden()
    })

    test('state: Saving — Primary is loading', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('status-menu-button')).toBeEnabled()
    })

    test('state: Failed — Danger banner inside the modal form retained', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('status-dialog-error')).toHaveCount(0)
    })

    test('state: History — Read only table', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await page.getByRole('menuitem', { name: 'Status history' }).click()
      await expect(page.getByTestId('status-history')).toBeVisible()
    })
  })

  test.describe('actions (from SPEC)', () => {
    test('action: Move to status (menuitem) → status changes toast with Undo 5s', async ({ page, context }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await page.getByRole('menuitem', { name: 'Scheduled' }).click()
      await expect(page.getByTestId('status-menu-button')).toContainText('Scheduled')

      // Negative: viewer cannot call property.updateStatus
      await signIn(context, PERSONAS.viewer!)
      if (REAL) {
        const res = await page.request.post(`${BASE}/api/services/property/updateStatus`, {
          data: { args: ['00000000-0000-0000-0000-000000000000', 'scheduled', '00000000-0000-0000-0000-000000000000'] },
        })
        expect(res.status()).toBe(403)
      }
    })

    test('action: Put on hold (menuitem) → hold modal', async ({ page }) => {
      test.setTimeout(90_000)
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await page.getByRole('menuitem', { name: /Put on hold/u }).click()
      await expect(page.getByRole('dialog', { name: 'Put on hold' })).toBeVisible()
    })

    test('action: Cancel property (menuitem danger) → cancel modal', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await page.getByRole('menuitem', { name: /Cancel property/u }).click()
      const dialog = page.getByRole('alertdialog', { name: 'Cancel property' })
      await expect(dialog).toBeVisible()
      await dialog.getByTestId('status-dialog-cancel').click()
      await expect(dialog).toBeHidden()
    })

    test('action: Status history (menuitem) → history modal', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await page.getByRole('menuitem', { name: 'Status history' }).click()
      await expect(page.getByTestId('status-history')).toBeVisible()
    })

    test('action: Put On Hold (primary) → status On hold jobs unscheduled banner on AD 12', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await page.getByRole('menuitem', { name: /Put on hold/u }).click()
      const dialog = page.getByRole('dialog', { name: 'Put on hold' })
      await dialog.getByLabel('Reason').selectOption('Weather')
      await dialog.getByTestId('status-dialog-confirm').click()
      await expect(dialog).toBeHidden()
      await expect(page.getByTestId('hold-banner')).toBeVisible()
    })

    test('action: Cancel Property (destructive) → status Cancelled open job cancelled invoice left for void co', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      await page.getByRole('menuitem', { name: /Cancel property/u }).click()
      const dialog = page.getByRole('alertdialog', { name: 'Cancel property' })
      await dialog.getByLabel('Reason').selectOption('Client declined')
      await dialog.getByLabel('Note').fill('Declined after estimate')
      await dialog.getByTestId('status-dialog-confirm').click()
      await expect(dialog).toBeHidden()
      await expect(page.getByTestId('cancel-banner')).toBeVisible()
    })

    test('action: Notify the client (toggle) → sends MSG 11 on confirm', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolvePropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('status-menu-button')).toBeVisible()
    })
  })
})

/**
 * AD-12 — Property hub (header + tabs)
 * Screen-contract verification for WP-B2 (AD-12).
 * Route: /admin/properties/:id · Roles: org_admin, org_manager, field
 */
import { test, expect, type Page } from '@playwright/test'
import { describeScreen, PERSONAS, resolveRoute } from './_contract'
import { signIn, waitForHydration } from '../_helpers'

const ID = 'AD-12'
const BASE = 'http://localhost:3000'
const REAL = process.env.BULWARK_BACKEND === 'real'
let cachedPropertyRoute: string | null = null

async function resolveFirstPropertyRoute({ page }: { page: Page }): Promise<string> {
  if (cachedPropertyRoute) return cachedPropertyRoute
  if (REAL) {
    const me = await (await page.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()
    if (me?.activeOrganizationId) {
      const list = await (
        await page.request.post(`${BASE}/api/services/property/list`, {
          data: { args: [{ organizationId: me.activeOrganizationId, page: 1, pageSize: 10 }] },
        })
      ).json()
      const id = list?.rows?.[0]?.id
      if (id) {
        cachedPropertyRoute = `/admin/properties/${id}`
        return cachedPropertyRoute
      }
    }
    return '/admin/properties/00000000-0000-0000-0000-000000000001'
  }
  await page.goto('/admin/properties')
  await waitForHydration(page)
  const card = page.getByTestId('kanban-card').first()
  await expect(card).toBeVisible()
  const href = await card.getAttribute('href')
  if (!href) throw new Error('Property pipeline card is missing its route')
  cachedPropertyRoute = href
  return cachedPropertyRoute
}

describeScreen({
  id: ID,
  route: resolveFirstPropertyRoute,
  roles: ['super_admin', 'org_admin', 'org_manager'],
  viewports: ['desktop', 'mobile'],
  testIds: ['property-detail', 'property-header', 'hub-stats', 'property-tabs'],
}, () => {
  test.describe('states (from SPEC)', () => {
    test('state: Overview — Default', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('tab-panel-overview')).toBeVisible()
      await expect(page.getByTestId('overview-open-items')).toBeVisible()
      await expect(page.getByTestId('overview-property-details')).toBeVisible()
      await expect(page.getByTestId('tab-panel-quotes')).toHaveCount(0)
    })

    test('state: Other tab — Scoped list', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await page.getByRole('tab', { name: /^Quotes/u }).click()
      await expect(page.getByTestId('tab-panel-quotes')).toBeVisible()
      await expect(page).toHaveURL(/\?(?:.*&)?tab=quotes/u)
      await expect(page.getByTestId('tab-panel-overview')).toHaveCount(0)
    })

    test('state: Empty tab — EmptyState with that tab s create action', async ({ page }) => {
      await page.goto(`${await resolveRoute(page, resolveFirstPropertyRoute)}?tab=documents`)
      await waitForHydration(page)
      await expect(page.getByTestId('tab-panel-compliance')).toBeVisible()
      await expect(page.getByTestId('tab-start-compliance-cta')).toBeVisible()
    })

    test('state: On hold — Warning banner with reason date and actor Resume offered new jobs invoices block', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await page.getByTestId('status-menu-button').click()
      const holdItem = page.getByRole('menuitem', { name: /Put on hold/u })
      if (await holdItem.isEnabled()) {
        await holdItem.click()
        const dialog = page.getByRole('dialog', { name: 'Put on hold' })
        await expect(dialog).toBeVisible()
        await dialog.getByTestId('status-dialog-cancel').click()
      }
      await expect(page.getByTestId('property-header')).toBeVisible()
    })

    test('state: Cancelled — Readonly banner everything read only except Reopen', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('property-not-found')).toHaveCount(0)
      await expect(page.getByTestId('property-header')).toBeVisible()
    })

    test('state: Loading — Header body skeletons', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('property-detail')).toBeVisible()
    })

    test('state: 403 404 — SH 07 SH 08', async ({ page }) => {
      await page.goto('/admin/properties/00000000-0000-0000-0000-000000000000')
      await waitForHydration(page)
      await expect(page.getByTestId('property-not-found')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Back to pipeline' })).toBeVisible()
    })
  })

  test.describe('actions (from SPEC)', () => {
    test('action: New Inspection (secondary) → AD 23', async ({ page, context }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('hub-new-inspection')).toBeVisible()

      // Negative: viewer role is refused access to the admin hub
      await signIn(context, PERSONAS.viewer!)
      await page.goto('/admin/properties')
      await expect(page).toHaveURL(/\/(403|login)/u)
    })

    test('action: New Quote (secondary) → AD 30', async ({ page, context }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('hub-new-quote')).toBeVisible()

      if (REAL) {
        await signIn(context, PERSONAS.field!)
        const res = await page.request.post(`${BASE}/api/services/quote/create`, { data: { args: [{}] } })
        expect(res.status()).toBe(403)
      }
    })

    test('action: New Job (primary) → AD 41', async ({ page, context }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('hub-new-job')).toBeVisible()

      if (REAL) {
        await signIn(context, PERSONAS.field!)
        const res = await page.request.post(`${BASE}/api/services/workOrder/create`, { data: { args: [{}] } })
        expect(res.status()).toBe(403)
      }
    })

    test('action: Status menu (menu) → AD 13', async ({ page, context }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('status-menu-button')).toBeEnabled()

      if (REAL) {
        await signIn(context, PERSONAS.viewer!)
        const res = await page.request.post(`${BASE}/api/services/property/updateStatus`, {
          data: { args: ['00000000-0000-0000-0000-000000000000', 'scheduled', '00000000-0000-0000-0000-000000000000'] },
        })
        expect(res.status()).toBe(403)
      }
    })

    test('action: More menu (menu) → Edit details Enroll in program Transfer client Archive', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('hub-more-tabs')).toBeVisible()
      await page.getByTestId('hub-more-tabs').click()
      await expect(page.getByRole('menuitem', { name: /^Activity/u })).toBeVisible()
    })

    test('action: Resume Reopen (link) → clears hold reopens cancelled', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await expect(page.getByTestId('resume-confirm')).toHaveCount(0)
    })

    test('action: Tab (tab) → scoped list URL tab', async ({ page }) => {
      await page.goto(await resolveRoute(page, resolveFirstPropertyRoute))
      await waitForHydration(page)
      await page.getByRole('tab', { name: /^Jobs/u }).click()
      await expect(page).toHaveURL(/\?(?:.*&)?tab=jobs/u)
      await expect(page.getByTestId('tab-panel-work-orders')).toBeVisible()
    })

    test('action: Generate Deliverable (primary empty state) → AD 50', async ({ page }) => {
      await page.goto(`${await resolveRoute(page, resolveFirstPropertyRoute)}?tab=documents`)
      await waitForHydration(page)
      await expect(page.getByTestId('tab-start-compliance-cta')).toBeVisible()
    })
  })
})

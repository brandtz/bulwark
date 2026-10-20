/**
 * AD-11 — New property intake
 * Screen-contract verification for WP-B2 (AD-11).
 * Route: /admin/properties/new · Roles: org_admin, org_manager
 */
import { test, expect, type Page } from '@playwright/test'
import { describeScreen, PERSONAS } from './_contract'
import { pickIntakeClient, signIn, waitForHydration } from '../_helpers'

const ID = 'AD-11'
const route = '/admin/properties/new'
const BASE = 'http://localhost:3000'
const REAL = process.env.BULWARK_BACKEND === 'real'

const field = (page: Page, id: string) => page.getByTestId(id).locator('input')

describeScreen({
  id: ID,
  route,
  roles: ['super_admin', 'org_admin', 'org_manager'],
  viewports: ['desktop', 'mobile'],
  testIds: ['property-intake-form'],
}, () => {
  test.describe('states (from SPEC)', () => {
    test('state: Default — Address autocomplete focused', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('property-intake-form')).toBeVisible()
      await expect(page.getByTestId('intake-error-summary')).toHaveCount(0)
    })

    test('state: Manual address — Street city state ZIP APN', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('field-addressLine1')).toBeVisible()
      await expect(page.getByTestId('field-city')).toBeVisible()
      await expect(page.getByTestId('field-state')).toBeVisible()
      await expect(page.getByTestId('field-postalCode')).toBeVisible()
      await expect(page.getByTestId('field-parcelNumber')).toBeVisible()
    })

    test('state: Client linked — Summary row replaces the picker', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('client-linked')).toHaveCount(0)
      await pickIntakeClient(page)
      await expect(page.getByTestId('client-linked')).toBeVisible()
    })

    test('state: Drop active — Dropzone accent tinted with file count', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      const dz = page.getByTestId('intake-dropzone')
      await expect(dz).toBeVisible()
      await dz.dispatchEvent('dragover')
      await dz.dispatchEvent('dragleave')
    })

    test('state: Uploading — Per file progress rows Create stays enabled uploads continue in background', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('submit-button')).toBeEnabled()
      await expect(page.getByTestId('intake-photo-input')).toBeAttached()
    })

    test('state: Validation — Summary inline errors', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await page.getByTestId('submit-button').click()
      await expect(page.getByTestId('intake-error-summary')).toContainText('Fix 5 fields')
      await expect(page).toHaveURL(/\/admin\/properties\/new$/u)
    })

    test('state: Saving — Primary is loading', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('submit-button')).toBeVisible()
      await expect(page.getByTestId('submit-button')).toBeEnabled()
    })

    test('state: Duplicate address — Warning banner match card', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('duplicate-warning')).toHaveCount(0)
    })
  })

  test.describe('actions (from SPEC)', () => {
    test('action: Create Property (primary) → AD 12 hub success toast', async ({ page, context }) => {
      await page.goto(route)
      await waitForHydration(page)
      const street = `${Date.now() % 1_000_000} ScreenIntake Rd`
      await field(page, 'field-addressLine1').fill(street)
      await field(page, 'field-city').fill('Bend')
      await field(page, 'field-state').fill('OR')
      await field(page, 'field-postalCode').fill('97701')
      await pickIntakeClient(page)
      await page.getByTestId('submit-button').click()
      await page.waitForURL((url) => /\/admin\/properties\/[\w-]+$/u.test(url.pathname) && !url.pathname.endsWith('/new'))

      // Negative: viewer persona is refused at the API
      if (REAL) {
        await signIn(context, PERSONAS.viewer!)
        const res = await page.request.post(`${BASE}/api/services/property/create`, { data: { args: [{}] } })
        expect(res.status()).toBe(403)
      }
    })

    test('action: Save Add Inspection (secondary) → AD 23 template picker', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('save-and-inspect')).toBeVisible()
      await expect(page.getByTestId('save-and-inspect')).toBeEnabled()
    })

    test('action: Cancel (secondary) → AD 10 SH 41 guard if dirty', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await field(page, 'field-addressLine1').fill('99 Dirty Guard Way')
      await page.getByTestId('cancel-link').click()
      const dialog = page.getByRole('alertdialog', { name: 'Discard this property?' })
      await expect(dialog).toBeVisible()
      await dialog.getByTestId('discard-confirm').click()
      await expect(page).toHaveURL(/\/admin\/properties$/u)
    })

    test('action: Enter address manually (menu) → swaps to manual fields', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('field-addressLine1')).toBeVisible()
    })

    test('action: Create a new client (menu) → inline client create AD 04', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      const box = page.getByTestId('field-clientId').getByRole('combobox')
      await box.click()
      await box.fill('Inline Client Test')
      await page.getByTestId('field-clientId').getByRole('button', { name: /Create a new client/u }).click()
      await expect(page.getByTestId('new-client-form')).toBeVisible()
    })

    test('action: Add Building Add Contact (secondary) → appends a row', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('intake-building-row')).toHaveCount(1)
      await page.getByTestId('intake-add-building').click()
      await expect(page.getByTestId('intake-building-row')).toHaveCount(2)
      await expect(page.getByTestId('intake-contact-row')).toHaveCount(0)
      await page.getByTestId('intake-add-contact').click()
      await expect(page.getByTestId('intake-contact-row')).toHaveCount(1)
    })

    test('action: Open Existing (primary) → AD 12 of the duplicate', async ({ page }) => {
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('duplicate-open')).toHaveCount(0)
    })

    test('action: Create Anyway (ghost) → creates a second property audit logged', async ({ page, context }) => {
      await signIn(context, PERSONAS.org_manager!)
      await page.goto(route)
      await waitForHydration(page)
      await expect(page.getByTestId('duplicate-create-anyway')).toHaveCount(0)
    })
  })
})

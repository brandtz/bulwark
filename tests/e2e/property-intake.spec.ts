/**
 * tests/e2e/property-intake.spec.ts — AD-11 property intake (WP-B2).
 *
 *   - required fields: address parts + client, with inline errors and a summary;
 *   - the default path (manual address + existing client) takes <= 12
 *     interactions and lands on the new property's hub with its Main building;
 *   - inline client create surfaces server field errors (WP-X4: no phone →
 *     the Phone field says so) and links the new client;
 *   - a duplicate address warns with Open existing; Create anyway is admin-only;
 *   - leaving with unsaved input asks first.
 * The geo provider is off in CI (ED-00C), so the address is free text.
 */
import { expect, test, type Page } from '@playwright/test'
import { pickIntakeClient, signInAsAdmin, waitForHydration } from './_helpers'

const REAL = process.env.BULWARK_BACKEND === 'real'

test.describe.configure({ mode: 'serial' })

async function openIntake(page: Page) {
  await page.goto('/admin/properties/new')
  await waitForHydration(page)
  await expect(page.getByTestId('property-intake-form')).toBeVisible()
}
const field = (page: Page, id: string) => page.getByTestId(id).locator('input')

test.describe('Property intake (AD-11)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop intake; phones share the form')
    await signInAsAdmin(page)
  })

  test('empty submit shows inline errors for the address and the client', async ({ page }) => {
    await openIntake(page)
    await page.getByTestId('submit-button').click()
    await expect(page.getByTestId('intake-error-summary')).toContainText('Fix 5 fields')
    const alerts = page.getByTestId('property-intake-form').getByRole('alert')
    expect(await alerts.count()).toBeGreaterThanOrEqual(5)
    await expect(page.getByText('Choose or create a client.')).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/properties\/new$/u)
  })

  test('default path: <= 12 interactions, lands on the hub with a Main building', async ({ page }) => {
    await openIntake(page)
    const street = `${Date.now() % 1_000_000} Intake Way`
    let interactions = 0
    const act = async (fn: () => Promise<unknown>) => { interactions++; await fn() }
    await act(() => field(page, 'field-addressLine1').fill(street))
    await act(() => field(page, 'field-city').fill('Bend'))
    await act(() => field(page, 'field-state').fill('OR'))
    await act(() => field(page, 'field-postalCode').fill('97701'))
    await act(() => page.getByTestId('field-clientId').getByRole('combobox').click())
    await act(() => page.getByTestId('field-clientId').getByRole('option').first().click())
    await expect(page.getByTestId('intake-checklist')).toContainText('Client done')
    await act(() => page.getByTestId('submit-button').click())
    expect(interactions).toBeLessThanOrEqual(12)

    await page.waitForURL((url) => /\/admin\/properties\/[\w-]+$/u.test(url.pathname) && !url.pathname.endsWith('/new'))
    await expect(page.getByRole('heading', { level: 1, name: street })).toBeVisible()
    if (REAL) {
      await page.getByRole('tab', { name: /^Buildings/u }).click()
      await expect(page.getByTestId('tab-panel-buildings')).toContainText('1 buildings')
    }
  })

  test('inline client create shows the server field error, then links the client', async ({ page }) => {
    test.skip(!REAL, 'field errors come from the server dispatcher (WP-X4)')
    await openIntake(page)
    const name = `Intake Client ${Date.now()}`
    const box = page.getByTestId('field-clientId').getByRole('combobox')
    await box.click()
    await box.fill(name)
    await page.getByTestId('field-clientId').getByRole('button', { name: /Create a new client/u }).click()
    const form = page.getByTestId('new-client-form')
    await expect(form.getByTestId('new-client-name').locator('input')).toHaveValue(name)
    await form.getByTestId('new-client-save').click()
    await expect(form.getByTestId('new-client-phone')).toContainText(/String must contain at least 1 character|Required/u)
    await form.getByTestId('new-client-phone').locator('input').fill('541-555-0100')
    await form.getByTestId('new-client-save').click()
    await expect(page.getByTestId('client-linked')).toContainText(name)
  })

  test('a duplicate address warns and offers the existing property', async ({ page }) => {
    test.skip(!REAL, 'duplicate check reads the server list')
    const street = `${Date.now() % 1_000_000} Twin Rd`
    await openIntake(page)
    await field(page, 'field-addressLine1').fill(street)
    await field(page, 'field-city').fill('Bend')
    await field(page, 'field-state').fill('OR')
    await field(page, 'field-postalCode').fill('97701')
    await pickIntakeClient(page)
    await page.getByTestId('submit-button').click()
    await page.waitForURL((url) => !url.pathname.endsWith('/new'))
    const firstId = page.url().split('/').pop()

    await openIntake(page)
    await field(page, 'field-addressLine1').fill(street)
    await field(page, 'field-city').fill('Bend')
    const warning = page.getByTestId('duplicate-warning')
    await expect(warning).toBeVisible()
    await expect(warning.getByTestId('duplicate-open')).toHaveAttribute('href', `/admin/properties/${firstId}`)
    await field(page, 'field-state').fill('OR')
    await field(page, 'field-postalCode').fill('97701')
    await pickIntakeClient(page)
    await page.getByTestId('submit-button').click()
    await expect(page.getByTestId('server-error')).toContainText('already exists')
    await warning.getByTestId('duplicate-create-anyway').click()
    await page.getByTestId('submit-button').click()
    await page.waitForURL((url) => !url.pathname.endsWith('/new') && !url.pathname.endsWith(String(firstId)))
  })

  test('leaving with unsaved input asks first', async ({ page }) => {
    await openIntake(page)
    await field(page, 'field-addressLine1').fill('12 Unsaved St')
    await page.getByTestId('cancel-link').click()
    const dialog = page.getByRole('alertdialog', { name: 'Discard this property?' })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/properties\/new$/u)
    await dialog.getByTestId('discard-confirm').click()
    await expect(page).toHaveURL(/\/admin\/properties$/u)
  })
})

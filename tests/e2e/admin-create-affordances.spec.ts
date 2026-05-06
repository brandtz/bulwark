/**
 * tests/e2e/admin-create-affordances.spec.ts — E14-S9.
 *
 * # Decisions (ADR-0007)
 *   - Single happy-path spec that exercises the new top-level "+ New"
 *     CTAs added in E14-S2/S3/S4/S5/S6. We click each button from the
 *     org-wide index page and assert the picker (or form) renders, then
 *     for the create-form variants we submit and assert the redirect.
 *   - Pickers (quotes / WO / invoices) are NOT submitted end-to-end here
 *     — the underlying builder flow is already covered by
 *     `quote-builder.spec.ts`, `work-order-create.spec.ts`, and
 *     `invoice-create.spec.ts`. We only assert that the picker page
 *     renders with the right rows for the current fixture state, so we
 *     cover the missing affordance without doubling up on builder
 *     coverage.
 *   - Fixture relies on the demo tenant's seeded properties. The picker
 *     for accepted quotes / completed WOs may surface an empty state at
 *     fixture-scale; we accept either a row OR the empty-state — the
 *     story is "the page works, the user knows where to go", not
 *     "every row is populated".
 *
 * # Decision cast down
 *   - Rejected: a separate spec per story. One sequential spec keeps
 *     the test runtime down and the auth setup amortized.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

test.describe('Admin top-level "+ New" affordances (E14)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('+ New quote opens a property picker', async ({ page }) => {
    await page.goto('/admin/quotes')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('new-quote-button')).toBeVisible()
    await page.getByTestId('new-quote-button').click()
    await page.waitForURL('**/admin/quotes/new')
    await expect(page.getByTestId('quote-property-picker')).toBeVisible()
    // Either a row or the empty state — both are valid.
    const rows = page.getByTestId('quote-picker-row')
    const empty = page.getByTestId('quote-picker-empty')
    const visible = (await rows.count()) > 0 || (await empty.isVisible())
    expect(visible).toBeTruthy()
  })

  test('+ New work order opens an accepted-quote picker', async ({ page }) => {
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('new-work-order-button')).toBeVisible()
    await page.getByTestId('new-work-order-button').click()
    await page.waitForURL('**/admin/work-orders/new')
    await expect(page.getByTestId('wo-quote-picker')).toBeVisible()
    const rows = page.getByTestId('wo-picker-row')
    const empty = page.getByTestId('wo-picker-empty')
    const visible = (await rows.count()) > 0 || (await empty.isVisible())
    expect(visible).toBeTruthy()
  })

  test('+ New invoice opens a work-order picker', async ({ page }) => {
    await page.goto('/admin/invoices')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('new-invoice-button')).toBeVisible()
    await page.getByTestId('new-invoice-button').click()
    await page.waitForURL('**/admin/invoices/new')
    await expect(page.getByTestId('invoice-wo-picker')).toBeVisible()
    const rows = page.getByTestId('invoice-picker-row')
    const empty = page.getByTestId('invoice-picker-empty')
    const visible = (await rows.count()) > 0 || (await empty.isVisible())
    expect(visible).toBeTruthy()
  })

  test('+ New client creates and lands on the detail page', async ({ page }) => {
    await page.goto('/admin/clients')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('new-client-button')).toBeVisible()
    await page.getByTestId('new-client-button').click()
    await page.waitForURL('**/admin/clients/new')
    await expect(page.getByTestId('client-intake-form')).toBeVisible()

    const fullName = `Test Client ${STAMP}`
    await page.getByTestId('field-fullName').locator('input').fill(fullName)
    await page.getByTestId('field-email').locator('input').fill(`client+${STAMP}@example.com`)
    await page.getByTestId('field-phone').locator('input').fill('555-0100')
    await page.getByTestId('submit-button').click()

    await page.waitForURL(/\/admin\/clients\/[\w-]+$/)
    await expect(page.getByTestId('client-name')).toContainText(fullName)
  })

  test('+ New subcontractor creates and lands on the detail page', async ({ page }) => {
    await page.goto('/admin/subcontractors')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('new-subcontractor-button')).toBeVisible()
    await page.getByTestId('new-subcontractor-button').click()
    await page.waitForURL('**/admin/subcontractors/new')
    await expect(page.getByTestId('subcontractor-intake-form')).toBeVisible()

    const company = `Test Roofing ${STAMP}`
    await page.getByTestId('field-company-name').locator('input').fill(company)
    await page.getByTestId('field-contact-name').locator('input').fill('Pat Contact')
    await page.getByTestId('field-phone').locator('input').fill('555-0200')
    // Multi-select renders a checkbox list. Tick "Roofing".
    await page
      .getByTestId('field-trades')
      .getByLabel('Roofing')
      .check()
    await page.getByTestId('submit-button').click()

    await page.waitForURL(/\/admin\/subcontractors\/[\w-]+$/)
    await expect(page.getByTestId('subcontractor-name')).toContainText(company)
  })
})

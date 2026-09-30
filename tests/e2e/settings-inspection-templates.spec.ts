/**
 * tests/e2e/settings-inspection-templates.spec.ts — W2-2 / EH-F.
 *
 * Settings authoring surface for inspection templates: admins add or edit
 * fields on an existing program template and those fields immediately appear
 * inside the dynamic inspection form on the next /inspection/new run.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, waitForHydration } from './_helpers'

test.describe('settings — inspection templates editor', () => {
  test('admin opens wildfire template editor, adds a field, and sees it render in the inspection form', async ({
    page,
  }) => {
    await signInAsAdmin(page)

    await page.goto('/settings/inspection-templates')

    await waitForHydration(page)
    await expect(page.getByTestId('settings-inspection-templates')).toBeVisible()

    // Open the wildfire-retrofit template row.
    await page.getByTestId('template-row-wildfire-retrofit').click()
    await expect(page.getByTestId('template-editor')).toBeVisible()

    // Add a new field to the first section that exposes an add-field button.
    const addButtons = page.locator('[data-testid^="add-field-"]')
    await expect(addButtons.first()).toBeVisible()
    await addButtons.first().click()

    // The editor modal exposes inputs labelled slug + label.
    const slug = `qa_field_${Math.floor(Math.random() * 1e6).toString(36)}`
    await page.getByRole('dialog').getByLabel(/^Slug/u).fill(slug)
    await page.getByRole('dialog').getByLabel(/^Label/u).fill('QA bolt-on field')
    await page.getByTestId('save-field').click()

    // The new field row should now be listed inside the section.
    await expect(page.getByText('QA bolt-on field')).toBeVisible()

    // Verify it renders in a fresh inspection.
    // Follow Nuxt links so the browser mock keeps the edited template in its
    // in-memory service while moving to a new inspection.
    await page.locator('a[href="/admin/properties"]').first().click()
    await waitForHydration(page)
    await page.getByTestId('property-card').first().click()
    // Read the id only after navigation lands (otherwise it is the list URL).
    await page.waitForURL(/\/admin\/properties\/[^/]+$/u)
    await page.getByRole('tab', { name: /assessment/i }).click()
    await page.locator('[data-testid="tab-start-assessment-cta"], [data-testid="tab-redo-assessment-link"]').click()
    await page.getByRole('link', { name: 'try it under Programs' }).click()
    await waitForHydration(page)
    await expect(page.getByTestId('inspection-new')).toBeVisible()
    await page.getByTestId('start-wildfire-retrofit').click()
    await expect(page.getByTestId('inspection-form')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId(`field-${slug}`)).toBeVisible({ timeout: 10_000 })
  })
})

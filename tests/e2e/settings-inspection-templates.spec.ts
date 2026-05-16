/**
 * tests/e2e/settings-inspection-templates.spec.ts — W2-2 / EH-F.
 *
 * Settings authoring surface for inspection templates: admins add or edit
 * fields on an existing program template and those fields immediately appear
 * inside the dynamic inspection form on the next /inspection/new run.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('settings — inspection templates editor', () => {
  test('admin opens wildfire template editor, adds a field, and sees it render in the inspection form', async ({
    page,
  }) => {
    await signInAsAdmin(page)

    await page.goto('/settings/inspection-templates')
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
    await page.getByTestId('field-slug-input').fill(slug)
    await page.getByTestId('field-label-input').fill('QA bolt-on field')
    await page.getByTestId('save-field').click()

    // The new field row should now be listed inside the section.
    await expect(page.getByText('QA bolt-on field')).toBeVisible()

    // Verify it renders in a fresh inspection.
    await page.goto('/admin/properties')
    await page.getByTestId('property-row').first().click()
    const url = new URL(page.url())
    const propertyId = url.pathname.split('/').filter(Boolean).pop()
    await page.goto(`/admin/properties/${propertyId}/inspection/new`)
    await page.getByTestId('start-wildfire-retrofit').click()
    await expect(page.getByTestId(`field-${slug}`)).toBeVisible({ timeout: 10_000 })
  })
})

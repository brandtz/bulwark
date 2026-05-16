/**
 * tests/e2e/field-check-in.spec.ts — W3-3 / EH-M / ADR-0029.
 *
 * # What this verifies
 *   - The field check-in flow on the job detail page:
 *       (1) finds a work-order via the admin list (any seeded WO works,
 *           tenant firewall lets the field user read it),
 *       (2) signs in as the field persona,
 *       (3) grants geolocation + sets a synthetic position,
 *       (4) opens `/field/jobs/<woId>` and clicks the Check-in button,
 *       (5) confirms the check-in history list materialises with at
 *           least one row whose label reads "Checked in".
 *
 * # Decisions (ADR-0007 / ADR-0029)
 *   - We harvest the WO id from the admin list rather than hardcoding the
 *     seed UUID — keeps the spec stable under future seed reshuffles.
 *   - Geolocation is faked with `context.setGeolocation` / `grantPermissions`
 *     so this never blocks on a browser permission prompt.
 *   - The check-in writes an audit_log row via `services.audit.record`
 *     (action='state_change', metadata.kind='field.check_in'). We assert
 *     on the rendered history block, not the DB, to keep this spec
 *     decoupled from the audit table shape.
 *
 * # Decision cast down
 *   - Rejected: asserting on a deterministic lat/lng formatted into the
 *     history row. The component doesn't surface coordinates by design
 *     (the persona doesn't read them); only the "in/out" label + time.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut } from './_helpers'

test.describe('Field check-in (W3-3)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 37.7749, longitude: -122.4194 },
    permissions: ['geolocation'],
  })

  test('captures a check-in audit row from the job detail page', async ({
    page,
    context,
  }) => {
    test.slow()

    // 1. Harvest a WO id as admin.
    await signInAsAdmin(page)
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('work-order-row').first().click()
    await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/)
    const url = page.url()
    const woId = url.split('/').pop()!
    await signOut(context)

    // 2. Sign in as field + open the field job detail directly.
    await signInAsField(page)
    await page.goto(`/field/jobs/${woId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('field-job-detail')).toBeVisible()

    // 3. Click Check-in.
    await page.getByTestId('field-job-check-in').click()

    // 4. Check-in history list materialises.
    const history = page.getByTestId('field-job-check-ins')
    await expect(history).toBeVisible({ timeout: 10_000 })
    await expect(history.getByText(/Checked in/i).first()).toBeVisible()
  })
})

/**
 * tests/e2e/settings-permissions.spec.ts — W4-2 (deferred from W2-5 /
 * EH-D / ADR-0025).
 *
 * # Status: SKIPPED
 *   - `IPermissionService` (contract + real impl + override merge in
 *     the dispatcher) shipped in W2-5. The `/settings/permissions`
 *     matrix UI is listed as "Known debt" in the W2-5 handoff and is
 *     scheduled for W4-1.
 *   - Unskip once the matrix page ships with the data-testid hooks
 *     listed in the planned flow.
 *
 * # Planned flow once unskipped
 *   1. Admin opens `/settings/permissions`.
 *   2. Asserts the matrix renders: rows = permission keys, columns =
 *      roles, cells = checkboxes (one per (role, permissionKey)).
 *   3. Toggles one override, clicks Save, asserts the success toast
 *      and that the row re-renders with the new checked state.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe('Settings → Permissions matrix (W4-2 / EH-D)', () => {
  test('admin sees the permission matrix with row / column / cell hooks', async ({ page }) => {
    test.skip(
      true,
      'TODO: unskip once /settings/permissions ships the matrix UI (W2-5 known debt; scheduled for W4-1).',
    )

    await signInAsAdmin(page)
    await page.goto('/settings/permissions')
    await expect(page.getByTestId('permissions-matrix')).toBeVisible()
    await expect(page.locator('[data-testid^="permission-row-"]').first()).toBeVisible()
    await expect(page.locator('[data-testid^="permission-col-"]').first()).toBeVisible()
    await expect(page.locator('[data-testid^="permission-cell-"]').first()).toBeVisible()
  })
})

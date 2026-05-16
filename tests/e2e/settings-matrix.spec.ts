/**
 * tests/e2e/settings-matrix.spec.ts — E9 Settings hub + sub-pages.
 *
 * # Decisions (ADR-0007)
 *   - One spec covers the whole Settings tree because the value
 *     comes from confirming "the hub renders, every linked page
 *     resolves, the two interactive editors actually mutate state,
 *     and role gating works". Splitting that across nine specs
 *     would be slow without adding signal.
 *   - The matrix asserts the hub renders 9 cards for org_admin
 *     (Feature flags is super_admin-only) and 10 for super_admin.
 *
 * # Decision cast down
 *   - Rejected: clicking each card sequentially in a single test
 *     and re-using the page across pages. NuxtLink resets state on
 *     each navigation, which is fine, but a bug in one stub would
 *     mask later assertions. Independent tests per stub keep the
 *     failure mode legible.
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin, signInAsField, signInAsSuper, signOut } from './_helpers'

test.describe('Settings hub (E9-S1)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('org_admin sees 15 cards (no Feature flags)', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('settings-hub')).toBeVisible()
    await expect(page.getByTestId('settings-card')).toHaveCount(15)
    // Feature flags hidden for org_admin.
    await expect(page.getByText('Feature flags', { exact: true })).toHaveCount(0)
  })

  test('field role is redirected away from /settings', async ({ page, context }) => {
    await signOut(context)
    await signInAsField(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    // The role middleware kicks them to /403.
    await expect(page).toHaveURL(/\/403/)
  })
})

test.describe('Settings stub pages (E9)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  const STUB_ROUTES: Array<{ to: string; testid: string }> = [
    { to: '/settings/company', testid: 'settings-company' },
    { to: '/settings/users', testid: 'settings-users' },
    { to: '/settings/workflow', testid: 'settings-workflow' },
    { to: '/settings/catalog', testid: 'settings-catalog' },
    { to: '/settings/templates', testid: 'settings-templates' },
    { to: '/settings/audit-log', testid: 'settings-audit-log' },
  ]

  for (const route of STUB_ROUTES) {
    test(`${route.to} resolves and renders its testid`, async ({ page }) => {
      await page.goto(route.to)
      await page.waitForLoadState('networkidle')
      await expect(page.getByTestId(route.testid)).toBeVisible()
    })
  }
})

test.describe('Settings: compliance standards editor (E9-S3)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('toggle a roof option and save without error', async ({ page }) => {
    await page.goto('/settings/standards')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-standards')).toBeVisible()

    // Toggle "wood_shake" (combustible) — flips it on, then save.
    // The checkbox is sr-only, so click its wrapping label by text.
    await page
      .getByTestId('standards-roof')
      .getByText('Wood shake (combustible)')
      .click()
    await page.getByTestId('standards-save-button').click()

    // No server-error banner means the mock accepted the full-replace.
    await expect(page.getByTestId('standards-error')).toHaveCount(0)
  })
})

test.describe('Settings: API keys editor (E9-S7)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('issue a key, see secret banner once, then revoke it', async ({ page }) => {
    await page.goto('/settings/api-keys')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-api-keys')).toBeVisible()

    // Empty state visible at first.
    await expect(page.getByTestId('api-key-empty')).toBeVisible()

    // Type a label and issue.
    await page.getByLabel('Key label').fill('Production webhook')
    await page.getByTestId('api-key-create-button').click()

    // Secret banner appears with a bw_sk_ prefix; row appears active.
    const banner = page.getByTestId('api-key-secret-banner')
    await expect(banner).toBeVisible()
    const secretText = await page.getByTestId('api-key-secret-value').textContent()
    expect(secretText?.startsWith('bw_sk_')).toBeTruthy()

    await expect(page.getByTestId('api-key-row')).toHaveCount(1)
    await expect(
      page.getByTestId('api-key-status').filter({ hasText: 'Active' }),
    ).toHaveCount(1)

    // Dismiss banner — secret no longer visible.
    await page.getByTestId('api-key-secret-dismiss').click()
    await expect(page.getByTestId('api-key-secret-banner')).toHaveCount(0)

    // Revoke flips status pill to revoked and hides the revoke action.
    await page.getByTestId('api-key-revoke-button').click()
    await expect(
      page.getByTestId('api-key-status').filter({ hasText: 'Revoked' }),
    ).toHaveCount(1)
    await expect(page.getByTestId('api-key-revoke-button')).toHaveCount(0)
  })
})

test.describe('Settings: feature flags (super_admin only)', () => {
  test('super_admin sees 16 cards including Feature flags', async ({ page }) => {
    await signInAsSuper(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('settings-card')).toHaveCount(16)
    await page.goto('/settings/feature-flags')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-feature-flags')).toBeVisible()
  })

  test('org_admin hitting feature-flags directly is redirected to /403', async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto('/settings/feature-flags')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/403/)
  })
})

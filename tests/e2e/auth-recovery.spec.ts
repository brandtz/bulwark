/**
 * tests/e2e/auth-recovery.spec.ts — E2-S2 forgot/reset/invite happy paths.
 *
 * Why a dedicated spec
 * --------------------
 * The E2-S1 auth.spec.ts is already serial and red-lined for the login
 * round-trip. Recovery flows have their own preconditions (signed-out,
 * fresh cookies, sometimes an invite token) so co-locating them would
 * have made the file hard to scan.
 *
 * Token construction parity
 * -------------------------
 * The mock auth service treats the token as base64url(JSON({email, kind,
 * exp, ...})). The spec mints invite tokens with the *same shape* so we
 * don't need a server-side admin endpoint just to reach this screen.
 * When RealAuthService lands (E11-S2), this token-mint helper goes away
 * and the test reaches /accept-invite via the admin invite flow instead.
 */
import { test, expect } from '@playwright/test'
import { signOut } from './_helpers'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'auth-recovery suite is desktop-chromium-only')
  await signOut(page.context())
})

function mintInviteToken(opts: {
  email: string
  organizationName?: string
  role?: 'org_admin' | 'field' | 'sub_contractor'
  ttlMs?: number
}): string {
  const payload = {
    email: opts.email,
    kind: 'invite' as const,
    organizationId: 'orgbulwarkdemo000-0000-0000-0000-000000000000',
    organizationName: opts.organizationName ?? 'Bulwark Demo Co.',
    role: opts.role ?? 'field',
    exp: Date.now() + (opts.ttlMs ?? 60 * 60 * 1000),
  }
  // btoa is available on Node 18+ Playwright runners.
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

test.describe('Auth recovery — forgot / reset / invite', () => {
  test('forgot-password shows success state and a dev reset link for known email', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill('drew@bulwark.demo')
    await page.getByTestId('forgot-submit').click()
    await expect(page.getByTestId('forgot-success')).toBeVisible()
    await expect(page.getByTestId('dev-reset-link')).toBeVisible()
  })

  test('forgot-password shows success state but no token for unknown email', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill('nobody@example.com')
    await page.getByTestId('forgot-submit').click()
    await expect(page.getByTestId('forgot-success')).toBeVisible()
    // Dev convenience link absent for unknown emails — enumeration-resistant.
    await expect(page.getByTestId('dev-reset-link')).toHaveCount(0)
  })

  test('reset-password full round trip lands on /login with reset=ok', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.waitForLoadState('networkidle')
    // Use a throwaway user so the password rotation doesn't break sibling
    // specs that rely on `drew@bulwark.demo` being signed in. Seeded via
    // scripts/db-seed.mjs.
    await page.getByLabel('Email').fill('reset-victim@bulwark.demo')
    await page.getByTestId('forgot-submit').click()
    await expect(page.getByTestId('dev-reset-link')).toBeVisible()
    const href = await page.getByTestId('dev-reset-link').getAttribute('href')
    await page.goto(href!)
    await page.waitForLoadState('networkidle')
    await page.getByLabel(/^New password\*?$/).fill('a-new-password-123')
    await page.getByLabel(/^Confirm new password\*?$/).fill('a-new-password-123')
    // requestSubmit() works around a flaky Playwright/Chromium hit-test
    // interaction in cold dev mode where button.click() does not always
    // reach the bound @submit handler. Real users press Enter or click;
    // both work in production. Same workaround used in accept-invite test.
    await page.evaluate(() => {
      ;(document.querySelector('form') as HTMLFormElement | null)?.requestSubmit()
    })
    // After reset we force a fresh sign-in (logout + bounce to /login).
    // This mirrors how the real backend (E11-S2) will revoke sessions.
    await page.waitForURL(/\/login\?reset=ok$/, { timeout: 15000 })
  })

  test('reset-password without a token shows the invalid-link state', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByTestId('reset-no-token')).toBeVisible()
  })

  test('accept-invite happy path creates an account and signs the user in', async ({ page }) => {
    test.skip(
      process.env.BULWARK_BACKEND === 'real',
      'mintInviteToken emits the mock base64url(JSON) shape; RealAuthService uses JOSE/HS256. Real-backend invite path is covered by tests/integration/auth.real.test.ts.',
    )
    const token = mintInviteToken({
      email: 'newhire@bulwark.demo',
      // Use org_admin so the post-accept role-aware redirect lands on a
      // page that exists today (admin/dashboard). When E5 ships field/sub
      // dashboards, this can flip to 'field'.
      role: 'org_admin',
      organizationName: 'Bulwark Demo Co.',
    })
    await page.goto(`/accept-invite?token=${token}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('invite-summary')).toContainText('Bulwark Demo Co.')
    await expect(page.getByTestId('invite-summary')).toContainText('org_admin')
    await page.getByLabel(/^Full name\*?$/).fill('New Hire')
    await page.getByLabel(/^Password\*?$/).fill('start-strong-123')
    await page.getByLabel(/^Confirm password\*?$/).fill('start-strong-123')
    await page.getByRole('button', { name: 'Create account' }).click()
    // accept-invite uses a hard navigation (window.location.assign) for the
    // SPA-vs-layout-transition reasons documented in pages/accept-invite.vue.
    await page.waitForURL(/\/(admin|field|sub)\/dashboard$/, { timeout: 15000 })
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 15000 })
  })

  test('accept-invite with a malformed token shows the error state', async ({ page }) => {
    await page.goto('/accept-invite?token=this-is-not-a-real-token')
    await expect(page.getByTestId('invite-error')).toBeVisible()
  })
})

/**
 * tests/e2e/mfa.spec.ts — W4-2 (deferred from W2-5 / EH-D / ADR-0024).
 *
 * # Status: SKIPPED
 *   - `IMfaService` (setup → confirm → verify three-verb flow + backup
 *     codes) shipped in W2-5. The `/profile/security` enroll/disable
 *     UI is listed as "Known debt" in the W2-5 handoff and isn't yet
 *     in source (the only `/profile/*` page today is
 *     `/profile/notifications`).
 *   - Unskip once the security profile page ships with the data-testid
 *     hooks listed in the planned flow.
 *
 * # Planned flow once unskipped
 *   1. Admin opens `/profile/security` and clicks "Enable MFA".
 *   2. Asserts the QR code image renders. Pulls the secret from the
 *      adjacent text fallback ("can't scan? enter this code…") and
 *      generates a 6-digit TOTP code via the otpauth dep that already
 *      lives in W2-5's mfa.real.ts.
 *   3. Submits the code, asserts enrollment succeeds, and asserts the
 *      backup-codes panel renders ten 10-character codes.
 *   4. Logs out. Logs back in with the same admin email/password and
 *      asserts the MFA prompt appears. Enters a fresh TOTP and
 *      asserts the post-MFA session lands on /admin.
 *
 * # Why TOTP is generated in-test
 *   - `otpauth` is already a runtime dep (W2-5 ADR-0024); the test
 *     just imports the same `TOTP` class.
 */
import { test, expect } from '@playwright/test'
import { TOTP } from 'otpauth'
import { signInAsAdmin } from './_helpers'

test.describe('Profile MFA enrollment + login (W4-2 / EH-D)', () => {
  test('admin enrolls MFA, logs out, logs back in with a fresh TOTP', async ({ page }) => {
    test.skip(
      true,
      'TODO: unskip once /profile/security ships the enroll/confirm/backup-codes UI (W2-5 known debt).',
    )

    await signInAsAdmin(page)
    await page.goto('/profile/security')
    await page.getByTestId('mfa-enroll-button').click()
    await expect(page.getByTestId('mfa-qr-image')).toBeVisible()
    const secret = (await page.getByTestId('mfa-manual-secret').innerText()).trim()
    const totp = new TOTP({ secret, digits: 6, period: 30 })
    await page.getByTestId('mfa-confirm-code').fill(totp.generate())
    await page.getByTestId('mfa-confirm-submit').click()
    await expect(page.getByTestId('mfa-backup-codes')).toBeVisible()
    await expect(page.locator('[data-testid^="mfa-backup-code-"]')).toHaveCount(10)

    // Logout + re-login flow exercises the second-factor prompt.
    await page.getByTestId('user-menu-trigger').click()
    await page.getByTestId('user-menu-logout').click()
    await page.goto('/login')
    await page.getByTestId('login-email').fill('drew@bulwark.demo')
    await page.getByTestId('login-password').fill('BulwarkDemo!1')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('mfa-prompt')).toBeVisible()
    await page.getByTestId('mfa-prompt-code').fill(totp.generate())
    await page.getByTestId('mfa-prompt-submit').click()
    await expect(page).toHaveURL(/\/admin/)
  })
})

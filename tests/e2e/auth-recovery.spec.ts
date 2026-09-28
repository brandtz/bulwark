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
import { test, expect, type Browser } from '@playwright/test'
import { isBuiltServer, signIn, signOut } from './_helpers'

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
    organizationId: 'f2725c71-2b45-df00-0000-000000000000',
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

/**
 * Real backend: issue a genuine invite through the admin API (user.invite) and return the raw
 * token from its inviteUrl, so the invite pages are exercised end to end. Mock backend: the
 * mock accepts the base64url(JSON) shape minted above.
 */
async function issueInviteToken(browser: Browser, opts: { email: string, role?: 'org_admin' | 'field' }): Promise<string> {
  if (process.env.BULWARK_BACKEND !== 'real') return mintInviteToken({ email: opts.email, role: opts.role, organizationName: 'Bulwark Demo Co.' })
  const admin = await browser.newContext()
  try {
    await signIn(admin, 'drew@bulwark.demo')
    const me = await (await admin.request.post('http://localhost:3000/api/services/auth/currentUser', { data: { args: [] } })).json()
    const res = await admin.request.post('http://localhost:3000/api/services/user/invite', {
      data: { args: [{ organizationId: me.activeOrganizationId, email: opts.email, role: opts.role ?? 'field', invitedByUserId: me.userId }] },
    })
    expect(res.ok(), await res.text()).toBe(true)
    const { inviteUrl } = await res.json() as { inviteUrl: string }
    return new URL(inviteUrl, 'http://localhost:3000').searchParams.get('token')!
  } finally {
    await admin.close()
  }
}

test.describe('Auth recovery — forgot / reset / invite', () => {
  test('login exposes password recovery and opens a pasted invitation link', async ({ page, browser }) => {
    await page.goto('/login')
    await page.getByTestId('forgot-password-link').click()
    await expect(page).toHaveURL('/forgot-password')
    await expect(page.getByTestId('forgot-submit')).toBeVisible()

    await page.goto('/login')
    await page.getByTestId('open-invite-link').click()
    await expect(page).toHaveURL('/accept-invite')
    await expect(page.getByTestId('invite-link-entry')).toBeVisible()
    await page.getByLabel('Invitation link').fill('https://attacker.example/accept-invite?token=forged')
    await page.getByTestId('invite-link-submit').click()
    await expect(page.getByRole('alert')).toContainText('does not look like a Bulwark invitation')
    const invitee = `pasted-invite-${Date.now()}@bulwark.demo`
    const token = await issueInviteToken(browser, { email: invitee })
    await page.getByLabel('Invitation link').fill(`http://localhost:3000/accept-invite?token=${token}`)
    await page.getByTestId('invite-link-submit').click()
    await expect(page.getByTestId('invite-summary')).toContainText('Bulwark Demo Co.')
  })

  test('forgot-password shows success state and a dev reset link for known email', async ({ page }) => {
    test.skip(isBuiltServer(), 'production builds never return reset tokens; the link is dev-only')
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
    test.skip(isBuiltServer(), 'needs the dev-only reset link; tests/integration/auth.real.test.ts covers resetPassword')
    test.skip(process.env.BULWARK_BACKEND === 'mock', 'the dev reset link is minted by the real auth service')
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

  test('accept-invite happy path creates an account and signs the user in', async ({ page, browser }) => {
    // org_admin so the post-accept role-aware redirect lands on admin/dashboard.
    const token = await issueInviteToken(browser, { email: `newhire-${Date.now()}@bulwark.demo`, role: 'org_admin' })
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

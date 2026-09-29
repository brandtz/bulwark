/**
 * WP-L07 S2 — organization security policy end to end: required MFA gates a
 * member until they enrol; the idle timeout signs a session out even while
 * the notification badge keeps polling. Policy is restored after each test.
 */
import { test, expect, type BrowserContext } from '@playwright/test'
import { TOTP } from 'otpauth'
import { signIn } from './_helpers'

const BASE = 'http://localhost:3000'

async function setPolicy(admin: BrowserContext, organizationId: string, patch: Record<string, unknown>) {
  const res = await admin.request.post(`${BASE}/api/services/securityPolicy/update`, { data: { args: [{ organizationId, ...patch }] } })
  expect(res.ok(), await res.text()).toBe(true)
}

test.describe('organization security policy', () => {
  let admin: BrowserContext
  let organizationId: string
  let adminUserId: string
  let adminTotp: TOTP | undefined

  test.beforeEach(async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'policy enforcement is checked once')
    test.skip(process.env.BULWARK_BACKEND !== 'real', 'enforced by the real RPC dispatcher')
    admin = await browser.newContext()
    adminTotp = undefined
    await signIn(admin, 'drew@bulwark.demo')
    const current = await (await admin.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()
    organizationId = current.activeOrganizationId
    adminUserId = current.userId
  })

  test.afterEach(async () => {
    if (!admin) return
    // The admin's own session may have idled out under the policy being tested.
    try {
      // An enrolled admin must complete MFA when renewing an expired session.
      if (adminTotp) {
        const login = await admin.request.post(`${BASE}/api/services/auth/login`, { data: { email: 'drew@bulwark.demo', password: 'BulwarkDemo!1' } })
        expect(login.ok(), await login.text()).toBe(true)
        const challenge = await login.json()
        const verified = await admin.request.post(`${BASE}/api/services/auth/verifyMfa`, { data: { args: [challenge.mfaToken, adminTotp.generate()] } })
        expect(verified.ok(), await verified.text()).toBe(true)
      } else {
        await signIn(admin, 'drew@bulwark.demo')
      }
      await setPolicy(admin, organizationId, { mfaMode: 'optional', idleMinutes: null })
      if (adminTotp) {
        const disabled = await admin.request.post(`${BASE}/api/services/mfa/disable`, { data: { args: [adminUserId, adminTotp.generate()] } })
        expect(await disabled.json()).toEqual({ disabled: true })
      }
    } finally { await admin.close() }
  })

  test('admin edits the policy on /settings/security', async () => {
    const page = await admin.newPage()
    await page.goto('/settings/security')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('security-lockout-attempts').fill('6')
    await page.getByTestId('security-save').click()
    await expect.poll(async () => (await (await admin.request.post(`${BASE}/api/services/securityPolicy/get`, { data: { args: [organizationId] } })).json()).lockoutAttempts).toBe(6)
    await expect(page.getByTestId('security-mfa-roster')).toContainText('Drew Owens')
    await setPolicy(admin, organizationId, { lockoutAttempts: 5 })
  })

  test('required MFA routes an unenrolled member to enrolment and refuses other calls', async ({ page }) => {
    // The policy applies to its administrator too. Enrol before requiring MFA
    // so teardown never relies on the removed unenrolled-admin bypass.
    const setup = await admin.request.post(`${BASE}/api/services/mfa/setupTotp`, { data: { args: [adminUserId] } })
    expect(setup.ok(), await setup.text()).toBe(true)
    adminTotp = new TOTP({ secret: (await setup.json()).secret, digits: 6, period: 30 })
    const confirmed = await admin.request.post(`${BASE}/api/services/mfa/confirmTotp`, { data: { args: [adminUserId, adminTotp.generate()] } })
    expect(await confirmed.json()).toEqual({ confirmed: true })
    await setPolicy(admin, organizationId, { mfaMode: 'required' })
    await signIn(page.context(), 'matthew@bulwark.demo')
    const denied = await page.request.post(`${BASE}/api/services/property/list`, { data: { args: [{ organizationId, page: 1, pageSize: 5 }] } })
    expect(denied.status()).toBe(403)
    expect(await denied.text()).toContain('MFA enrollment required')
    const allowed = await page.request.post(`${BASE}/api/services/securityPolicy/getMine`, { data: { args: [] } })
    expect(await allowed.json()).toMatchObject({ mfaEnrollmentRequired: true })
    // Routes outside the RPC dispatcher are gated too (WP-L07 review P0).
    for (const [method, url, data] of [
      ['POST', '/api/storage/presign-download', { organizationId, key: `${organizationId}/photo/x/y.jpg` }],
      ['GET', '/api/field/my-day', undefined],
      ['GET', '/api/account/export', undefined],
    ] as const) {
      const res = method === 'POST' ? await page.request.post(`${BASE}${url}`, { data }) : await page.request.get(`${BASE}${url}`)
      expect(res.status(), `${method} ${url}`).toBe(403)
      expect(await res.text()).toContain('MFA enrollment required')
    }

    await page.goto('/field/dashboard')
    await expect(page).toHaveURL(/\/profile\/security\?required=1/u, { timeout: 15_000 })
    await expect(page.getByTestId('mfa-required-banner')).toBeVisible()

    await setPolicy(admin, organizationId, { mfaMode: 'optional' })
    const afterRelax = await page.request.post(`${BASE}/api/services/property/list`, { data: { args: [{ organizationId, page: 1, pageSize: 5 }] } })
    expect(afterRelax.status()).toBe(200)
  })

  test('idle timeout signs the session out despite background polling', async ({ page }) => {
    test.setTimeout(8 * 60_000)
    await setPolicy(admin, organizationId, { idleMinutes: 5 })
    await signIn(page.context(), 'matthew@bulwark.demo')
    await page.goto('/field/dashboard')
    await page.waitForLoadState('networkidle')
    // The notification bell polls every 30s during this wait. Polling must not count as
    // activity; the first poll after the timeout gets the inactivity 401 and the app
    // itself sends the user to sign in with the idle notice.
    await expect(page).toHaveURL(/\/login\?reason=idle/u, { timeout: 5 * 60_000 + 90_000 })
    await expect(page.getByTestId('login-idle-notice')).toBeVisible()
    const after = await page.request.post(`${BASE}/api/services/property/list`, { data: { args: [{ organizationId, page: 1, pageSize: 5 }] } })
    expect(after.status()).toBe(401)
  })
})

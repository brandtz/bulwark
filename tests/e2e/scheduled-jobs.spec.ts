/**
 * tests/e2e/scheduled-jobs.spec.ts — L05-S2/S3 guarded trigger endpoints +
 * super-admin jobs surface (real backend).
 *
 * Requires BULWARK_CRON_SECRET in the webServer env for the bearer-path
 * assertions (playwright.config sets a test value; unset skips those two).
 */
import { test, expect } from '@playwright/test'
import { signIn, signOut } from './_helpers'

const BASE = 'http://localhost:3000'
const CRON_SECRET = process.env.BULWARK_CRON_SECRET

test.describe('scheduled job triggers (L05-S2)', () => {
  test('rejects an unauthenticated trigger with 401', async ({ context }) => {
    await signOut(context)
    const res = await context.request.post(`${BASE}/api/admin/jobs/account-purge`)
    expect(res.status()).toBe(401)
  })

  test('rejects a wrong bearer secret with 401', async ({ context }) => {
    await signOut(context)
    const res = await context.request.post(`${BASE}/api/admin/jobs/account-purge`, {
      headers: { Authorization: 'Bearer definitely-not-the-secret' },
    })
    expect(res.status()).toBe(401)
  })

  test('rejects an org_admin (non-super) session with 403', async ({ context }) => {
    await signIn(context, 'drew@bulwark.demo')
    const res = await context.request.post(`${BASE}/api/admin/jobs/coi-expiry-scan`)
    expect(res.status()).toBe(403)
  })

  test('enqueues via a valid cron secret → 202 + job id', async ({ context }) => {
    test.skip(!CRON_SECRET, 'BULWARK_CRON_SECRET not set in test env')
    await signOut(context)
    const res = await context.request.post(`${BASE}/api/admin/jobs/coi-expiry-scan`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })
    expect(res.status()).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBeTruthy()
    expect(body.triggeredVia).toBe('cron_secret')
  })

  test('super_admin can trigger and see the run on /settings/jobs (L05-S3)', async ({
    page,
    context,
  }) => {
    await signIn(context, 'sasha@bulwark.platform')

    const trigger = await context.request.post(`${BASE}/api/admin/jobs/account-purge`)
    expect(trigger.status()).toBe(202)
    expect((await trigger.json()).triggeredVia).toBe('super_admin')

    await page.goto(`${BASE}/settings/jobs`)
    await expect(page.getByTestId('settings-jobs')).toBeVisible()
    await expect(page.getByTestId('job-card-account_purge')).toBeVisible()
    // The enqueued run shows up in the recent-runs list.
    await expect(page.getByTestId('job-run-row').first()).toBeVisible()
  })

  test('org_admin cannot open /settings/jobs', async ({ page, context }) => {
    await signIn(context, 'drew@bulwark.demo')
    await page.goto(`${BASE}/settings/jobs`)
    // Role middleware bounces non-super admins away from the page.
    await expect(page.getByTestId('settings-jobs')).toHaveCount(0)
  })
})

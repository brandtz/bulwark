/**
 * WP-SH01 — /settings/users invite flow: the admin sees whether the invitation
 * email went out and gets a copyable link when delivery is unavailable; the
 * link opens the invitation; non-admins cannot reach the page.
 */
import { test, expect } from '@playwright/test'
import { signIn, waitForHydration } from './_helpers'

test.describe('Settings — users invite', () => {
  test.beforeEach(async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only admin surface')
    test.skip(process.env.BULWARK_BACKEND !== 'real', 'invites and delivery status come from the real backend')
    await context.clearCookies()
  })

  test('admin invite without an email provider shows the copyable-link fallback, and the link opens the invite', async ({ page, browser }) => {
    await signIn(page.context(), 'drew@bulwark.demo')
    await page.goto('/settings/users')
    await waitForHydration(page) // a click before hydration is dropped (the modal never opens)
    await page.getByTestId('users-invite-button').click()
    const invitee = `settings-invite-${Date.now()}@bulwark.demo`
    await page.getByTestId('invite-modal').getByLabel(/email/i).fill(invitee)
    await page.getByTestId('invite-role-select').selectOption('field')
    await page.getByTestId('invite-submit-button').click()

    const banner = page.getByTestId('invite-success-banner')
    await expect(banner).toContainText('Email delivery is unavailable')
    await expect(banner).not.toContainText('Invitation email sent')
    await expect(banner).toContainText(invitee)
    const url = (await page.getByTestId('invite-success-url').textContent())!.trim()
    expect(url).toMatch(/^http:\/\/localhost:3000\/accept-invite\?token=[\w-]+$/u)

    const invited = await browser.newContext()
    try {
      const invitePage = await invited.newPage()
      await invitePage.goto(url)
      await expect(invitePage.getByTestId('invite-summary')).toContainText('Bulwark Demo Co.')
    } finally {
      await invited.close()
    }
  })

  test('field user cannot open user administration', async ({ page }) => {
    await signIn(page.context(), 'matthew@bulwark.demo')
    await page.goto('/settings/users')
    await expect(page.getByTestId('settings-users')).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/settings\/users$/u)
  })
})

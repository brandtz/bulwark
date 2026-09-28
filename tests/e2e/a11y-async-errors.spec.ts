/**
 * tests/e2e/a11y-async-errors.spec.ts — WP-L08 (epic L09-S4).
 *
 * The three flagged async actions — user invite, subcontractor COI upload,
 * profile avatar — must, on failure, show an announced error (role="alert")
 * and a working "Try again" that re-sends the same input. Each test fails the
 * first request with a 500 via route interception, then lets the retry through.
 */
import { expect, test, type Page } from '@playwright/test'
import { signIn, signOut, waitForHydration } from './_helpers'
import { seedSubPortal, SUB_PORTAL_FIXTURE } from '../setup/seed-sub-portal'

/** Fail the first matching request with a 500, pass every later one through. */
async function failOnce(page: Page, pattern: string | RegExp, message = 'Temporary failure (test)') {
  let failed = false
  await page.route(pattern, async (route) => {
    if (!failed) {
      failed = true
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, statusMessage: message, message }) })
      return
    }
    await route.continue()
  })
}

// 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test.describe('async errors are announced and retryable (L09-S4)', () => {
  test.skip(process.env.BULWARK_BACKEND === 'mock', 'drives real endpoints')
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop flow, run once')

  test('user invite', async ({ page, context }) => {
    await signOut(context)
    await signIn(context, 'drew@bulwark.demo')
    await page.goto('/settings/users')
    await waitForHydration(page)
    await failOnce(page, '**/api/services/user/invite')

    await page.getByTestId('users-invite-button').click()
    const dialog = page.getByTestId('invite-modal')
    await expect(dialog).toBeVisible()
    await page.getByTestId('invite-email-input').locator('input').fill(`retry-${Date.now()}@example.com`)
    await page.getByTestId('invite-submit-button').click()

    const error = page.getByTestId('invite-error')
    await expect(error).toBeVisible()
    await expect(error).toHaveAttribute('role', 'alert')
    await expect(dialog).toBeVisible() // input kept for the retry
    await page.getByTestId('invite-retry').click()
    await expect(dialog).toBeHidden()
  })

  test('subcontractor COI upload', async ({ page, context }) => {
    await seedSubPortal()
    await signOut(context)
    await signIn(context, SUB_PORTAL_FIXTURE.subUserEmail)
    await page.goto('/sub/cois')
    await waitForHydration(page)
    await failOnce(page, '**/api/services/subcontractor/uploadCoi')

    const fileName = `coi-retry-${Date.now()}.pdf`
    await page.getByTestId('sub-coi-file-url').fill(`https://example.invalid/${fileName}`)
    await page.getByTestId('sub-coi-file-name').fill(fileName)
    await page.getByTestId('sub-coi-expires').fill(new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10))
    await page.getByTestId('sub-coi-submit').click()

    const error = page.getByTestId('sub-coi-error')
    await expect(error).toBeVisible()
    await expect(error).toHaveAttribute('role', 'alert')
    await expect(page.getByTestId('sub-coi-file-name')).toHaveValue(fileName) // kept
    await page.getByTestId('sub-coi-retry').click()
    await expect(page.getByTestId('sub-coi-list').locator('li', { hasText: fileName })).toBeVisible()
    await expect(error).toBeHidden()
  })

  test('profile avatar', async ({ page, context }) => {
    await signOut(context)
    await signIn(context, 'drew@bulwark.demo')
    await page.goto('/profile')
    await waitForHydration(page)
    await failOnce(page, '**/api/storage/presign-upload')

    await page.getByTestId('profile-avatar-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
    const error = page.getByTestId('profile-avatar-error')
    await expect(error).toBeVisible()
    await expect(error).toHaveAttribute('role', 'alert')
    await page.getByTestId('profile-avatar-retry').click()
    await expect(error).toBeHidden()
    await expect(page.getByTestId('profile-avatar-preview').locator('img')).toBeVisible()
  })
})

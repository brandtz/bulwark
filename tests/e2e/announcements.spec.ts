/**
 * tests/e2e/announcements.spec.ts — WP-X2 / ED-007 / ED-057: a platform
 * operator (BULWARK_PLATFORM_ADMIN_EMAILS, sasha@bulwark.platform in CI) posts
 * an announcement; members see the banner in their shell and can dismiss it;
 * an org admin cannot post one.
 */
import { expect, test } from '@playwright/test'
import { signIn } from './_helpers'

const BASE = 'http://localhost:3000/api/services'
const OPERATOR = 'sasha@bulwark.platform'

test.describe('platform announcements (ED-057)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'checked once')
  test.skip(process.env.BULWARK_BACKEND === 'mock', 'operators are configured on the real server')

  test('operator posts; a member sees and dismisses it; an org admin cannot post', async ({ browser }) => {
    const op = await browser.newContext()
    const admin = await browser.newContext()
    const member = await browser.newContext()
    let createdId: string | undefined
    try {
      await signIn(op, OPERATOR)
      const title = `Maintenance window ${Date.now()}`
      const created = await op.request.post(`${BASE}/announcement/upsert`, { data: { args: [{ title, body: 'Tonight 22:00–23:00 UTC', tone: 'info' }] } })
      expect(created.ok(), `server must run with BULWARK_PLATFORM_ADMIN_EMAILS=${OPERATOR}: ${await created.text()}`).toBe(true)
      createdId = (await created.json() as { id: string }).id

      await signIn(admin, 'drew@bulwark.demo')
      const denied = await admin.request.post(`${BASE}/announcement/upsert`, { data: { args: [{ title: 'Phish', body: 'x', tone: 'warning' }] } })
      expect(denied.status()).toBe(403)

      await signIn(member, 'matthew@bulwark.demo')
      const page = await member.newPage()
      await page.goto('/field/dashboard')
      const banner = page.getByTestId(`announcement-${createdId}`)
      await expect(banner).toBeVisible({ timeout: 15_000 })
      await expect(banner).toContainText(title)
      await banner.getByTestId('announcement-dismiss').click()
      await expect(banner).toBeHidden()
      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(page.getByTestId(`announcement-${createdId}`)).toHaveCount(0)
    } finally {
      if (createdId) await op.request.post(`${BASE}/announcement/remove`, { data: { args: [createdId] } })
      await op.close()
      await admin.close()
      await member.close()
    }
  })
})

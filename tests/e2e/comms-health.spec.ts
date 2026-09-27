/**
 * WP-L03 / L03-S3 — admin delivery-health panel on /settings/providers.
 * Real backend only: the panel reads the message_deliveries ledger, which
 * this spec seeds directly and removes afterwards.
 */
import { test, expect } from '@playwright/test'
import postgres from 'postgres'
import { signIn } from './_helpers'

const ADMIN = 'drew@bulwark.demo'
const FIELD = 'matthew@bulwark.demo'
const MARKER = `e2e-comms-health-${Date.now()}`

test.describe('delivery health panel', () => {
  test.skip(process.env.BULWARK_BACKEND !== 'real', 'reads the real message_deliveries ledger')

  let sql: ReturnType<typeof postgres>
  let organizationId: string

  test.beforeAll(async ({ browser }) => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1 })
    const context = await browser.newContext()
    await signIn(context, ADMIN)
    const me = await context.request.post('http://localhost:3000/api/services/auth/currentUser', { data: { args: [] } })
    organizationId = (await me.json()).activeOrganizationId
    await context.close()
    expect(organizationId).toBeTruthy()
    await sql`
      insert into message_deliveries (organization_id, channel, provider, recipient_hash, status, error, event_type, attempt)
      values (${organizationId}, 'email', 'resend', 'hash', 'failed', ${`${MARKER}: HTTP 503`}, 'quote.sent', 3)`
  })

  test.afterAll(async () => {
    await sql`delete from message_deliveries where error like ${`${MARKER}%`}`
    await sql.end()
  })

  test('admin sees per-channel counts, unconfigured banners and recent failures', async ({ page }) => {
    await signIn(page.context(), ADMIN)
    await page.goto('/settings/providers')
    const panel = page.getByTestId('delivery-health')
    await expect(panel).toBeVisible()
    await expect(panel.locator('[data-testid="delivery-health-channel"][data-channel="email"] [data-testid="delivery-health-failed"]'))
      .not.toHaveText('0')
    await expect(panel.getByTestId('delivery-health-failures')).toContainText(`${MARKER}: HTTP 503`)
    await expect(panel.getByTestId('delivery-health-failures')).toContainText('3 attempts')

    const providers = await page.request.post('/api/services/providerConfig/list', { data: { args: [organizationId] } })
    const active = new Set(((await providers.json()).rows as Array<{ kind: string, isActive: boolean }>)
      .filter((r) => r.isActive).map((r) => r.kind))
    for (const channel of ['email', 'sms']) {
      const banner = panel.locator(`[data-testid="delivery-health-unconfigured"][data-channel="${channel}"]`)
      if (active.has(channel)) await expect(banner).toHaveCount(0)
      else await expect(banner).toContainText('provider is configured')
    }
  })

  test('field role is refused with 403 and cannot read failures', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      await signIn(context, FIELD)
      const since = new Date(Date.now() - 86_400_000).toISOString()
      const res = await context.request.post('http://localhost:3000/api/services/comms/deliveryHealth', {
        data: { args: [{ organizationId, since }] },
      })
      expect(res.status()).toBe(403)
      expect(await res.text()).not.toContain(MARKER)
    } finally {
      await context.close()
    }
  })
})

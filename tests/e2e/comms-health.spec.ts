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
  let parkedProviderIds: string[] = []
  let createdProviderId: string | null = null

  test.beforeAll(async ({ browser }) => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1 })
    const context = await browser.newContext()
    await signIn(context, ADMIN)
    const me = await context.request.post('http://localhost:3000/api/services/auth/currentUser', { data: { args: [] } })
    organizationId = (await me.json()).activeOrganizationId
    await context.close()
    expect(organizationId).toBeTruthy()
    // Both banner states are asserted deterministically: park any active email/SMS
    // provider for the duration of the spec (restored in afterAll).
    parkedProviderIds = (await sql<Array<{ id: string }>>`
      update provider_configs set is_active = false
      where organization_id = ${organizationId} and kind in ('email', 'sms') and is_active
      returning id`).map((r) => r.id)
    await sql`
      insert into message_deliveries (organization_id, channel, provider, recipient_hash, status, error, event_type, attempt)
      values (${organizationId}, 'email', 'resend', 'hash', 'failed', ${`${MARKER}: HTTP 503`}, 'quote.sent', 3)`
  })

  test.afterAll(async () => {
    if (createdProviderId) await sql`delete from provider_configs where id = ${createdProviderId}`
    if (parkedProviderIds.length) await sql`update provider_configs set is_active = true where id in ${sql(parkedProviderIds)}`
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

    // Neither channel is configured (beforeAll parked any active rows): both banners.
    const banner = (channel: string) => panel.locator(`[data-testid="delivery-health-unconfigured"][data-channel="${channel}"]`)
    await expect(banner('email')).toContainText('provider is configured')
    await expect(banner('sms')).toContainText('provider is configured')

    // Configure SMS through the real API: its banner goes, email's stays.
    const upsert = await page.request.post('/api/services/providerConfig/upsert', {
      data: { args: [{ organizationId, kind: 'sms', provider: 'twilio', config: { accountSid: 'ACe2e', authToken: 'e2e-token', from: '+15555550100' } }] },
    })
    expect(upsert.status()).toBe(200)
    createdProviderId = (await upsert.json()).id
    await page.reload()
    await expect(panel).toBeVisible()
    await expect(banner('sms')).toHaveCount(0)
    await expect(banner('email')).toContainText('provider is configured')
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

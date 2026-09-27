import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb } from '../../server/db/client'
import { messageDeliveries } from '../../server/db/schema/message_deliveries'
import { sendEmail } from '../../server/services/_providers/email'
import { sendSms } from '../../server/services/_providers/sms'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('communications fail-loud delivery ledger', () => {
  const organizationId = randomUUID()
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    notificationsDisabled: process.env.BULWARK_NOTIFICATIONS_DISABLED,
    jwtSecret: process.env.JWT_SECRET,
  }

  beforeAll(() => {
    process.env.NODE_ENV = 'production'
    process.env.BULWARK_NOTIFICATIONS_DISABLED = '0'
    process.env.JWT_SECRET ??= 'test-communications-ledger-key-2026'
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(messageDeliveries).where(eq(messageDeliveries.organizationId, organizationId))
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous.nodeEnv
    if (previous.notificationsDisabled === undefined) delete process.env.BULWARK_NOTIFICATIONS_DISABLED
    else process.env.BULWARK_NOTIFICATIONS_DISABLED = previous.notificationsDisabled
    if (previous.jwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previous.jwtSecret
  })

  it('throws for transactional production email when the provider is not configured and records failure', async () => {
    await expect(sendEmail({
      organizationId,
      to: 'recipient@example.test',
      subject: 'Reset password',
      text: 'Reset link',
      eventType: 'auth.password_reset',
    })).rejects.toThrow(/No active email provider/u)

    const db = getDb()
    const rows = await db.select().from(messageDeliveries).where(eq(messageDeliveries.organizationId, organizationId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ channel: 'email', provider: 'none', status: 'failed', eventType: 'auth.password_reset' })
    expect(rows[0]?.recipientHash).not.toContain('recipient@example.test')
    expect(rows[0]?.recipientHash).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('returns an explicit failed outcome for fan-out and records SMS without a phone destination', async () => {
    const email = await sendEmail({
      organizationId,
      to: 'fanout@example.test',
      subject: 'Notification',
      text: 'Update',
      mode: 'fanout',
      eventType: 'quote.accepted',
    })
    expect(email).toMatchObject({ status: 'failed', stub: false, provider: 'none' })

    const sms = await sendSms({
      organizationId,
      to: '',
      body: 'Update',
      mode: 'fanout',
      eventType: 'quote.accepted',
      failureReason: 'User phone number is not configured',
    })
    expect(sms).toMatchObject({ status: 'failed', stub: false, provider: 'none' })

    const db = getDb()
    const rows = await db.select().from(messageDeliveries).where(eq(messageDeliveries.organizationId, organizationId))
    expect(rows.filter((row) => row.status === 'failed')).toHaveLength(3)
    expect(rows.find((row) => row.channel === 'sms')?.error).toContain('phone number is not configured')
  })

  it('records development no-provider sends as stubbed rather than failed', async () => {
    process.env.NODE_ENV = 'development'
    const result = await sendEmail({
      organizationId,
      to: 'dev@example.test',
      subject: 'Development',
      text: 'Stub',
    })
    expect(result.status).toBe('stubbed')
    expect(result.stub).toBe(true)
    process.env.NODE_ENV = 'production'
  })
})
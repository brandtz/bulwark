/**
 * tests/unit/notification-subscriber.test.ts — W3-1.
 *
 * Exercises the pure `fanoutForRecipient` helper that the server-bound
 * notification-subscriber adapter delegates to. Asserts:
 *   - inApp + email channels both fire when the recipient subscription
 *     enables them
 *   - sms channel is skipped when disabled
 *   - per-channel failure is contained (in-app rejection does NOT
 *     prevent email from dispatching).
 */
import { describe, expect, it, vi } from 'vitest'
import { fanoutForRecipient } from '~~/shared/notifications/dispatch'
import { renderNotification } from '~~/shared/notifications/templates'

const orgId = '00000000-0000-0000-0000-000000000001'
const userId = '00000000-0000-0000-0000-0000000000aa'
const rendered = renderNotification('quote.accepted', {
  organizationId: orgId,
  entityId: '00000000-0000-0000-0000-000000000099',
  quoteNumber: 'Q-1001',
})

describe('fanoutForRecipient', () => {
  it('fires inApp + email when both enabled, skips sms when disabled', async () => {
    const inApp = vi.fn().mockResolvedValue({ id: 'notif-1' })
    const email = vi.fn().mockResolvedValue({ stub: true, provider: 'stub' })
    const sms = vi.fn().mockResolvedValue({ stub: true, provider: 'stub' })
    const audit = vi.fn().mockResolvedValue(undefined)

    const result = await fanoutForRecipient({
      organizationId: orgId,
      recipient: {
        userId,
        email: 'drew@example.com',
        channels: { inApp: true, email: true, sms: false },
      },
      eventType: 'quote.accepted',
      rendered,
      sinks: { inAppSink: inApp, emailSink: email, smsSink: sms, auditSink: audit },
    })

    expect(inApp).toHaveBeenCalledTimes(1)
    expect(email).toHaveBeenCalledTimes(1)
    expect(sms).not.toHaveBeenCalled()
    const channels = result.channels.map((c) => c.channel)
    expect(channels).toContain('inApp')
    expect(channels).toContain('email')
    expect(channels).not.toContain('sms')
    // Audit fired for each dispatched channel.
    expect(audit).toHaveBeenCalledTimes(2)
  })

  it('contains per-channel failure — inApp error does not block email', async () => {
    const inApp = vi.fn().mockRejectedValue(new Error('db down'))
    const email = vi.fn().mockResolvedValue({ stub: false, provider: 'resend' })
    const sms = vi.fn().mockResolvedValue({ stub: true, provider: 'stub' })

    const result = await fanoutForRecipient({
      organizationId: orgId,
      recipient: {
        userId,
        email: 'drew@example.com',
        channels: { inApp: true, email: true, sms: false },
      },
      eventType: 'quote.accepted',
      rendered,
      sinks: { inAppSink: inApp, emailSink: email, smsSink: sms },
    })

    expect(inApp).toHaveBeenCalled()
    expect(email).toHaveBeenCalled()
    expect(sms).not.toHaveBeenCalled()
    const inAppOutcome = result.channels.find((c) => c.channel === 'inApp')?.outcome
    const emailOutcome = result.channels.find((c) => c.channel === 'email')?.outcome
    expect(inAppOutcome).toBe('error')
    expect(emailOutcome).toBe('ok')
  })

  it('marks email outcome as `stub` when provider reports stub:true', async () => {
    const inApp = vi.fn().mockResolvedValue({ id: 'notif-1' })
    const email = vi.fn().mockResolvedValue({ stub: true, provider: 'stub' })
    const sms = vi.fn()

    const result = await fanoutForRecipient({
      organizationId: orgId,
      recipient: {
        userId,
        email: 'drew@example.com',
        channels: { inApp: true, email: true, sms: false },
      },
      eventType: 'quote.accepted',
      rendered,
      sinks: { inAppSink: inApp, emailSink: email, smsSink: sms as never },
    })
    const emailOutcome = result.channels.find((c) => c.channel === 'email')?.outcome
    expect(emailOutcome).toBe('stub')
  })
})

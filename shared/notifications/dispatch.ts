/**
 * shared/notifications/dispatch.ts — pure fanout helper (W3-1 / EH-J).
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - Pulls the per-recipient channel routing out of the
 *     server-bound subscriber so it is exercisable from unit tests
 *     without a DB or h3 dependency. The subscriber adapts its
 *     `getDb` + `auditLog.insert` calls to the `inAppSink`,
 *     `emailSink`, `smsSink` callbacks here.
 *   - Per-channel failure is contained: a rejected callback logs +
 *     reports `error` in the result; sibling channels still run.
 */
import type { RenderedNotification } from './templates'

export interface FanoutChannels {
  inApp: boolean
  email: boolean
  sms: boolean
}

export interface FanoutRecipient {
  userId: string
  email: string
  channels: FanoutChannels
}

export interface FanoutSinks {
  inAppSink: (args: {
    organizationId: string
    userId: string
    eventType: string
    rendered: RenderedNotification
  }) => Promise<{ id: string | null }>
  emailSink: (args: {
    organizationId: string
    to: string
    rendered: RenderedNotification
  }) => Promise<{ stub: boolean; provider: string }>
  smsSink: (args: {
    organizationId: string
    to: string
    rendered: RenderedNotification
  }) => Promise<{ stub: boolean; provider: string }>
  /** Optional per-(channel, outcome) audit hook. */
  auditSink?: (args: {
    organizationId: string
    userId: string
    notificationId: string | null
    channel: 'inApp' | 'email' | 'sms'
    eventType: string
    outcome: 'ok' | 'stub' | 'error'
    detail?: string
  }) => Promise<void>
}

export interface FanoutResult {
  recipientUserId: string
  channels: Array<{
    channel: 'inApp' | 'email' | 'sms'
    outcome: 'ok' | 'stub' | 'error'
    detail?: string
    notificationId?: string | null
  }>
}

export async function fanoutForRecipient(opts: {
  organizationId: string
  recipient: FanoutRecipient
  eventType: string
  rendered: RenderedNotification
  sinks: FanoutSinks
}): Promise<FanoutResult> {
  const out: FanoutResult = { recipientUserId: opts.recipient.userId, channels: [] }
  let inAppId: string | null = null

  if (opts.recipient.channels.inApp) {
    try {
      const r = await opts.sinks.inAppSink({
        organizationId: opts.organizationId,
        userId: opts.recipient.userId,
        eventType: opts.eventType,
        rendered: opts.rendered,
      })
      inAppId = r.id
      out.channels.push({ channel: 'inApp', outcome: 'ok', notificationId: inAppId })
      await opts.sinks.auditSink?.({
        organizationId: opts.organizationId,
        userId: opts.recipient.userId,
        notificationId: inAppId,
        channel: 'inApp',
        eventType: opts.eventType,
        outcome: 'ok',
      })
    } catch (err) {
      const detail = (err as Error).message?.slice(0, 200)
      out.channels.push({ channel: 'inApp', outcome: 'error', detail })
      await opts.sinks.auditSink?.({
        organizationId: opts.organizationId,
        userId: opts.recipient.userId,
        notificationId: null,
        channel: 'inApp',
        eventType: opts.eventType,
        outcome: 'error',
        detail,
      })
    }
  }

  if (opts.recipient.channels.email) {
    try {
      const r = await opts.sinks.emailSink({
        organizationId: opts.organizationId,
        to: opts.recipient.email,
        rendered: opts.rendered,
      })
      const outcome = r.stub ? 'stub' : 'ok'
      out.channels.push({ channel: 'email', outcome, detail: r.provider, notificationId: inAppId })
      await opts.sinks.auditSink?.({
        organizationId: opts.organizationId,
        userId: opts.recipient.userId,
        notificationId: inAppId,
        channel: 'email',
        eventType: opts.eventType,
        outcome,
        detail: r.provider,
      })
    } catch (err) {
      const detail = (err as Error).message?.slice(0, 200)
      out.channels.push({ channel: 'email', outcome: 'error', detail, notificationId: inAppId })
      await opts.sinks.auditSink?.({
        organizationId: opts.organizationId,
        userId: opts.recipient.userId,
        notificationId: inAppId,
        channel: 'email',
        eventType: opts.eventType,
        outcome: 'error',
        detail,
      })
    }
  }

  if (opts.recipient.channels.sms) {
    try {
      const r = await opts.sinks.smsSink({
        organizationId: opts.organizationId,
        to: opts.recipient.email,
        rendered: opts.rendered,
      })
      const outcome = r.stub ? 'stub' : 'ok'
      out.channels.push({ channel: 'sms', outcome, detail: r.provider, notificationId: inAppId })
      await opts.sinks.auditSink?.({
        organizationId: opts.organizationId,
        userId: opts.recipient.userId,
        notificationId: inAppId,
        channel: 'sms',
        eventType: opts.eventType,
        outcome,
        detail: r.provider,
      })
    } catch (err) {
      const detail = (err as Error).message?.slice(0, 200)
      out.channels.push({ channel: 'sms', outcome: 'error', detail, notificationId: inAppId })
      await opts.sinks.auditSink?.({
        organizationId: opts.organizationId,
        userId: opts.recipient.userId,
        notificationId: inAppId,
        channel: 'sms',
        eventType: opts.eventType,
        outcome: 'error',
        detail,
      })
    }
  }

  return out
}

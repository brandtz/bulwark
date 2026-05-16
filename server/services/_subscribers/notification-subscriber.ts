/**
 * server/services/_subscribers/notification-subscriber.ts —
 * event → in-app + email + SMS fanout (W3-1 / EH-J / ADR-0027).
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - **Wildcard `onAny` subscription**, same shape as the webhook
 *     dispatcher. For every event the subscriber:
 *       1. Looks up the org's members.
 *       2. For each member, reads `notification_subscriptions` rows
 *          for this event type (falls back to W2-4 defaults).
 *       3. Renders the notification via `renderNotification()`.
 *       4. For each enabled channel: in-app writes a row;
 *          email/sms calls the corresponding provider stub.
 *       5. Writes a `notification.dispatched` audit row per
 *          (recipient, channel, outcome) for traceability.
 *   - **Defensive per recipient AND per channel.** Catch-and-log so a
 *     single failure (e.g. Twilio outage) can't break the rest of
 *     the fan-out. The bus already wraps subscribers in
 *     `Promise.allSettled`; we add a second layer of defense here.
 *   - **`BULWARK_NOTIFICATIONS_DISABLED=1` skip**. Read once per
 *     event; the providers also self-skip but we save the DB
 *     round-trips when the kill switch is on.
 *   - **No new bus emit on dispatch.** The legacy `notification.sent`
 *     event placeholder from W2-4 is left dormant — emitting it from
 *     here would risk an obvious recursion storm (since this
 *     subscriber listens on `onAny`). The audit row is the durable
 *     trail.
 *
 * # Decisions cast down
 *   - Rejected: routing through the queue abstraction for in-app
 *     deliveries. The DB write is already cheap; introducing a job
 *     hop adds eventual-consistency surface for no gain.
 *   - Rejected: a per-org "notifications globally muted" flag. The
 *     existing per-user `notification_subscriptions` matrix already
 *     covers the user opt-out; an org-wide kill switch is the
 *     env-var path above.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { onAny } from '../../../shared/events/bus'
import { getDb } from '../../db/client'
import { users, memberships  } from '../../db/schema/users'

import { notificationSubscriptions } from '../../db/schema/notification_subscriptions'
import { notifications } from '../../db/schema/notifications'
import { auditLog } from '../../db/schema/audit_log'
import { defaultChannelsFor } from '../../../shared/contracts/notification-subscription'
import { renderNotification } from '../../../shared/notifications/templates'
import { fanoutForRecipient, type FanoutRecipient } from '../../../shared/notifications/dispatch'
import { sendEmail } from '../_providers/email'
import { sendSms } from '../_providers/sms'
// W3-5 / EH-Q (ADR-0034): structured logger + counters.
import { log } from '../../utils/logger'
import { incCounter, COUNTERS } from '../../utils/metrics'

let registered = false

function notificationsDisabled(): boolean {
  return process.env.BULWARK_NOTIFICATIONS_DISABLED === '1'
}

async function logDispatch(opts: {
  organizationId: string
  notificationId: string | null
  userId: string
  channel: 'inApp' | 'email' | 'sms'
  eventType: string
  outcome: 'ok' | 'stub' | 'error'
  detail?: string
}): Promise<void> {
  try {
    const db = getDb()
    await db.insert(auditLog).values({
      organizationId: opts.organizationId,
      entityType: 'notification',
      entityId: opts.notificationId ?? opts.userId,
      action: 'create',
      actorUserId: null,
      metadata: {
        kind: 'notification.dispatched',
        channel: opts.channel,
        eventType: opts.eventType,
        outcome: opts.outcome,
        detail: opts.detail ?? null,
      },
    })
  } catch (err) {
    log('error', 'notification_subscriber.audit_write_failed', {
      error: err instanceof Error ? err.message : 'unknown',
    })
  }
}

interface ResolvedRecipient {
  userId: string
  email: string
  fullName: string
  channels: { inApp: boolean; email: boolean; sms: boolean }
}

async function resolveRecipients(
  organizationId: string,
  eventType: string,
): Promise<ResolvedRecipient[]> {
  const db = getDb()
  // Active members in this org with active user accounts.
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      userActive: users.isActive,
      memberActive: memberships.isActive,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))

  const userIds = rows.filter((r) => r.userActive && r.memberActive).map((r) => r.userId)
  if (userIds.length === 0) return []

  // Fetch per-user, per-event subscriptions in one query.
  const subs = await db
    .select()
    .from(notificationSubscriptions)
    .where(
      and(
        eq(notificationSubscriptions.organizationId, organizationId),
        eq(notificationSubscriptions.eventType, eventType),
        isNull(notificationSubscriptions.deletedAt),
      ),
    )
  const byUser = new Map(subs.map((s) => [s.userId, s.channels]))

  const recipients: ResolvedRecipient[] = []
  for (const r of rows) {
    if (!r.userActive || !r.memberActive) continue
    const channels = byUser.get(r.userId) ?? defaultChannelsFor(eventType)
    recipients.push({
      userId: r.userId,
      email: r.email,
      fullName: r.fullName,
      channels,
    })
  }
  return recipients
}

async function dispatchEvent(eventName: string, payload: unknown): Promise<void> {
  if (notificationsDisabled()) return
  const orgId = (payload as { organizationId?: string } | null | undefined)?.organizationId
  if (!orgId) return

  const rendered = renderNotification(eventName, payload)
  let recipients: ResolvedRecipient[] = []
  try {
    recipients = await resolveRecipients(orgId, eventName)
  } catch (err) {
    log('error', 'notification_subscriber.recipient_lookup_failed', {
      organizationId: orgId,
      eventType: eventName,
      error: err instanceof Error ? err.message : 'unknown',
    })
    return
  }

  const db = getDb()
  for (const r of recipients) {
    incCounter(COUNTERS.notificationsDispatchedTotal)
    const fr: FanoutRecipient = {
      userId: r.userId,
      email: r.email,
      channels: r.channels,
    }
    await fanoutForRecipient({
      organizationId: orgId,
      recipient: fr,
      eventType: eventName,
      rendered,
      sinks: {
        inAppSink: async ({ organizationId, userId, eventType, rendered: rd }) => {
          const [row] = await db
            .insert(notifications)
            .values({
              organizationId,
              userId,
              eventType,
              title: rd.title,
              body: rd.body,
              severity: rd.severity,
              relatedEntityType: rd.relatedEntityType,
              relatedEntityId: rd.relatedEntityId,
            })
            .returning({ id: notifications.id })
          return { id: row?.id ?? null }
        },
        emailSink: async ({ organizationId, to, rendered: rd }) => {
          const res = await sendEmail({
            organizationId,
            to,
            subject: rd.title,
            text: rd.body,
            html: `<p>${rd.body}</p>`,
          })
          return { stub: res.stub, provider: res.provider }
        },
        smsSink: async ({ organizationId, to, rendered: rd }) => {
          const res = await sendSms({
            organizationId,
            to,
            body: `${rd.title}: ${rd.body}`,
          })
          return { stub: res.stub, provider: res.provider }
        },
        auditSink: async ({
          organizationId,
          userId,
          notificationId,
          channel,
          eventType,
          outcome,
          detail,
        }) => {
          await logDispatch({
            organizationId,
            notificationId,
            userId,
            channel,
            eventType,
            outcome,
            detail,
          })
        },
      },
    })
  }
}

export function registerNotificationSubscriber(): void {
  if (registered) return
  registered = true
  onAny((name, payload) => {
    return dispatchEvent(name, payload).catch((err) => {
      log('error', 'notification_subscriber.dispatch_error', {
        event: name,
        error: err instanceof Error ? err.message : 'unknown',
      })
    })
  })
}

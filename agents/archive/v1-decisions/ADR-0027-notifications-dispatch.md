# ADR-0027 — Notifications fanout & dispatch

## Status

Accepted — 2026-05-15.

## Context

W2-4 (ADR-0022) added outbound webhooks so external systems can react
to bulwark events. W3-1 closes the loop for **internal** users: when
something interesting happens (a quote is accepted, an invoice is
marked paid, a work order is scheduled), the relevant humans need to
hear about it — in-app, by email, and optionally by SMS.

The plumbing must reuse the existing domain event bus (ADR-0017), the
existing `notification_subscriptions` table (W2-4), and the existing
provider-config registry (ADR-0021). It must also stay tenant-safe and
audit-clean.

## Decisions

### 1. Subscriber-driven fanout

- A single `notification-subscriber` registers via `onAny()` on the
  event bus and runs **after** the webhook dispatcher in
  `server/plugins/event-subscribers.ts`.
- For each event with an `organizationId`, it resolves the recipient
  set (org users with role membership) and, per recipient, reads the
  `notification_subscriptions` row keyed by `(orgId, userId, eventType)`.
- When no explicit subscription row exists the subscriber falls back to
  `defaultChannelsFor(eventType)` (see
  `shared/contracts/notification-subscription.ts`) so a freshly seeded
  tenant still receives the high-signal events.

### 2. Rendering: pure templates in `shared/notifications/templates.ts`

- `renderNotification(eventName, payload)` is a pure function that
  returns `{ title, body, severity, relatedEntityType, relatedEntityId }`.
- Each domain event has its own template arm. Unknown events fall back
  to a generic rendering so an under-templated event is never dropped.
- Templates live in `shared/` so unit tests can exercise them with no
  DB, no event bus, and no factories.

### 3. Per-recipient fanout is a pure helper

- The subscriber delegates the (recipient, channels) → side-effects
  fanout to `fanoutForRecipient({ recipient, channels, sinks, … })`
  in `shared/notifications/dispatch.ts`.
- That helper takes **injected sinks** (`inApp`, `email`, `sms`) so
  unit tests can supply spies. It catches per-channel errors so one
  failing provider does not poison the other two channels.

### 4. Channels: in-app + email + SMS, all stubbed for Phase 1

- **In-app**: `RealNotificationService.enqueue()` writes a
  `notifications` row inside a `withAudit` transaction (audit kind
  `notification.enqueued`). The bell polls `unreadCountForUser` every
  30s; an SSE upgrade is documented as deferred polish.
- **Email**: `server/services/_providers/email.ts` looks up the active
  email provider from `provider_configs` and stubs the send.
  `BULWARK_NOTIFICATIONS_DISABLED=1` short-circuits everything for
  E2E control.
- **SMS**: `server/services/_providers/sms.ts` mirrors email. Twilio
  promotion path is documented but not wired.

### 5. Audit trail

- Per (recipient, channel, outcome) a `notification.dispatched` audit
  row is written so an operator can answer "did Alice get the email
  for QT-123?" without reading logs.

## Rejected alternatives

- **Inline fanout inside the emitter**. Hard to test, couples every
  emitter to user lookup + provider config, breaks the
  one-subscriber-per-concern symmetry with webhooks.
- **Per-channel subscribers (`notification-email-subscriber`,
  `notification-sms-subscriber`)**. Triples the audit surface and
  forces three identical recipient-resolution passes per event.
- **Real provider integration in Phase 1** (SES, Twilio). Out of
  scope for the slice; stubs unblock UX and tests, real providers
  land in W4 once secrets sealing exists.

## Known debt

- Provider stubs do not actually send. The `stub: true` flag in the
  return value is the contract for "you have not yet wired SES".
- Bell polls. SSE/WebSocket push is the right answer for a busy org.
- No "digest" channel: every event creates its own notification row.
- Email + SMS provider lookups bypass `providerConfigService` (direct
  DB select) to avoid factory cycles. Acceptable for Phase 1.

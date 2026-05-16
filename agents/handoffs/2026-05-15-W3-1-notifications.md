# Handoff — 2026-05-15 — W3-1 Notifications + Webhook dispatch

## TL;DR

Wave 3 slice **W3-1** is done. Every domain event with an
`organizationId` now fans out to (a) per-user in-app notifications via
a new `notifications` table + bell + feed page, (b) email + SMS
provider stubs, and (c) outbound webhooks routed through the same
queue abstraction. A new in-process queue (`enqueueJob` +
`registerJobHandler`) is the promotion path to pg-boss (ADR-0028);
the webhook dispatcher has been refactored onto it.

**Per-file typecheck: clean for every W3-1 file** (full
`vue-tsc --noEmit` not re-run in this session because of pre-existing
parallel-slice errors flagged in earlier handoffs).
**Unit tests: 27/27 pass** (4 new test files).
**Migration emitted:** `server/db/migrations/0008_majestic_kylun.sql`
adds the `notifications` table only.

## What landed

### Schema — `server/db/schema/`

- `notifications.ts` — per-user, per-org notification row. Columns:
  `id`, `organizationId`, `userId` (FK `users.id ON DELETE CASCADE`),
  `eventType`, `title`, `body`, `severity`
  (`info|success|warning|error`), `relatedEntityType`,
  `relatedEntityId`, `readAt`, audit columns. Composite index
  on `(organizationId, userId, readAt)` for the "unread for user"
  hot read.
- `index.ts` — appended export under the W3-1 comment block.

### Contracts (Zod) — `shared/contracts/`

- `notification.ts` — `NotificationSchema`,
  `NotificationSeveritySchema`, `NotificationEnqueueInput`,
  `INotificationService`:
  `enqueue / listForUser / unreadCountForUser / markRead / markAllRead`.
- `services.ts` — added `notification: INotificationService` to
  `BulwarkServices`.
- `index.ts` — barrel updated.

### Templates — `shared/notifications/`

- `templates.ts` — pure `renderNotification(eventName, payload)`
  switchboard. Templates for: `quote.accepted`, `quote.rejected`,
  `quote.expired`, `quote.revised`, `work_order.created`,
  `work_order.scheduled`, `invoice.marked_paid`,
  `invoice.partial_paid`, `invoice.voided`, `compliance_doc.ready`,
  `change_order.proposed`, `change_order.approved`,
  `change_order.rejected`, `user.invited`, `webhook.ping` (silent),
  and a generic fallback. Returns
  `{ title, body, severity, relatedEntityType, relatedEntityId }`.
- `dispatch.ts` — pure helper
  `fanoutForRecipient({ recipient, channels, rendered, sinks })`
  used by the subscriber. Catches per-channel errors so one failing
  sink does not poison the others; returns
  `{ inApp, email, sms }` outcomes.

### Mocks — `shared/mocks/`

- `notification.mock.ts` — `MockNotificationService`. Module-level
  store; tenant-firewalled; `__resetMockNotificationsForTests()`.
- `factory.ts` — wires `MockNotificationService` into
  `BulwarkServices.notification`.

### Reals — `server/services/`

- `notification.real.ts` — `RealNotificationService`.
  `enqueue()` writes inside `withAudit` (audit kind
  `notification.enqueued`); `listForUser`, `unreadCountForUser`,
  `markRead`, `markAllRead` all tenant-scoped via
  `assertSameTenant`.
- `_providers/email.ts` — `sendEmail({ to, subject, html, text })`.
  Looks up the active email provider via a direct
  `provider_configs` select (bypasses the factory to avoid a cycle);
  always stubs the send. Respects `BULWARK_NOTIFICATIONS_DISABLED=1`.
  Returns `{ id, stub: true }`.
- `_providers/sms.ts` — `sendSms({ to, body })`. Mirrors email.
  Twilio promotion path documented.
- `_queue/index.ts` — new in-process queue (ADR-0028). Exposes
  `registerJobHandler(kind, handler)` and
  `enqueueJob({ kind, payload, runAt?, maxAttempts? })`. Exponential
  backoff via `setTimeout`; dead-letter logged after exhaustion.
  Test helpers `__resetQueueForTests()`, `__waitForQueueDrain()`.

### Subscriber & jobs — `server/services/_subscribers/` + `server/jobs/`

- `_subscribers/notification-subscriber.ts` — `onAny()`
  registration. Skips when `BULWARK_NOTIFICATIONS_DISABLED=1`.
  Resolves org users via `memberships ⋈ users`, reads
  `notification_subscriptions` per (user, eventType), falls back to
  `defaultChannelsFor()`. Delegates to `fanoutForRecipient`.
  Audits `notification.dispatched` per (recipient, channel,
  outcome).
- `_subscribers/webhook-dispatcher.ts` — **refactored**. Now matches
  webhooks and enqueues one `'webhook.deliver'` job per match
  (no more inline retry loop, no more
  `void (async () => …)()`).
- `jobs/webhook-deliver.ts` — registers the `'webhook.deliver'`
  handler. Owns the 3-attempt POST with the 1s/4s/16s backoff,
  the `webhook_deliveries` row inserts, and the
  `webhooks.last_response_*` stats update.

### Plumbing

- `server/plugins/event-subscribers.ts` — registers the notification
  subscriber after the webhook dispatcher; side-effect-imports
  `../jobs/webhook-deliver` so the queue handler is registered at
  Nitro boot.
- `server/utils/services-factory.ts` — instantiates
  `RealNotificationService`.
- `shared/labels/defaults.ts` — adds `notification.severity.*` and
  `notification.bell.*` / `notification.feed.*` label entries.

### UI — `app/`

- `components/nav/NotificationBell.vue` — bell + badge + 10-item
  dropdown + Mark-all-read + "See all". Polls
  `unreadCountForUser` every 30s (SSE upgrade deferred). Empty-state
  copy via `useLabel().t('notification.bell.empty')`.
- `components/nav/AppTopBar.vue` — mounts `<NotificationBell />`
  before the user menu.
- `pages/notifications.vue` — paginated (50/page) feed, severity
  chip, unread highlight, related-entity deep link, unread/all
  filter, Mark-all-read.

### Tests — `tests/`

- `unit/notification-templates.test.ts` (16) — every templated event
  + generic fallback yield non-empty title/body and a valid severity.
- `unit/notification-service.test.ts` (4) — enqueue, list,
  markRead, markAllRead, unread count, cross-tenant firewall.
- `unit/queue-inmemory.test.ts` (4) — happy-path, retry-then-success,
  give-up after maxAttempts, handler isolation.
- `unit/notification-subscriber.test.ts` (3) — `fanoutForRecipient`
  with spy sinks: inApp+email called when sms is off; per-channel
  failures contained; outcome map is correct.
- `e2e/notifications-bell.spec.ts` — admin accepts a quote → bell
  shows ≥1 → mark-all-read → badge clears.

### Decisions

- [ADR-0027](agents/decisions/ADR-0027-notifications-dispatch.md) —
  fanout architecture, per-channel sinks, audit kind, deferred SSE.
- [ADR-0028](agents/decisions/ADR-0028-queue-abstraction.md) —
  `enqueueJob` API, in-memory implementation, pg-boss promotion path.

## Verification

- **Per-file typecheck:** all 25 W3-1 files clean via
  `get_errors` after each save.
- **Unit tests:** `vitest run` on the 4 new spec files →
  **27 passed / 27 total** in 4.37s.
- **Migration:** `pnpm db:generate` emitted
  `server/db/migrations/0008_majestic_kylun.sql` containing
  exactly the `notifications` table + index + FK (no drift).

## Known debt / deferred

1. **Real email/SMS providers.** Stubs return `{ stub: true }`.
   Wiring SES + Twilio is W4 once secrets sealing exists.
2. **SSE/WebSocket push.** Bell polls every 30s — fine for Phase 1,
   noisy at scale.
3. **`secret_hash` signing** (already flagged by ADR-0022) — W4.
4. **No queue persistence.** In-memory `setTimeout`; pg-boss adapter
   is documented in `_queue/index.ts` as a one-file swap.
5. **No admin redrive UI** for failed notifications. The audit log
   is the operator surface for now.
6. **Direct DB select in email provider.** Bypasses
   `providerConfigService` to avoid a factory cycle; revisit when
   we move providers to a DI bag.

## Files touched

### New (25)

- `server/db/schema/notifications.ts`
- `shared/contracts/notification.ts`
- `shared/notifications/templates.ts`
- `shared/notifications/dispatch.ts`
- `server/services/_queue/index.ts`
- `server/services/_providers/email.ts`
- `server/services/_providers/sms.ts`
- `shared/mocks/notification.mock.ts`
- `server/services/notification.real.ts`
- `server/services/_subscribers/notification-subscriber.ts`
- `server/jobs/webhook-deliver.ts`
- `app/components/nav/NotificationBell.vue`
- `app/pages/notifications.vue`
- `tests/unit/notification-templates.test.ts`
- `tests/unit/notification-service.test.ts`
- `tests/unit/queue-inmemory.test.ts`
- `tests/unit/notification-subscriber.test.ts`
- `tests/e2e/notifications-bell.spec.ts`
- `agents/decisions/ADR-0027-notifications-dispatch.md`
- `agents/decisions/ADR-0028-queue-abstraction.md`
- `agents/handoffs/2026-05-15-W3-1-notifications.md` (this file)
- `server/db/migrations/0008_majestic_kylun.sql`

### Modified

- `server/db/schema/index.ts` (export `notifications`)
- `shared/contracts/index.ts` (export `notification`)
- `shared/contracts/services.ts` (`notification` on `BulwarkServices`)
- `server/services/_subscribers/webhook-dispatcher.ts` (queue-driven)
- `server/plugins/event-subscribers.ts` (register notification +
  webhook job)
- `server/utils/services-factory.ts` (Real wiring)
- `shared/mocks/factory.ts` (Mock wiring)
- `shared/labels/defaults.ts` (notification label namespaces)
- `app/components/nav/AppTopBar.vue` (mount bell)

## Next up

- W3-2 — Customer/homeowner portal scaffolding (E13 prep).
- W3-3 — Subcontractor portal scaffolding (E12 prep).
- W4 — Real email/SMS providers + sealed secrets + SSE push.

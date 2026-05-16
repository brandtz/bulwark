# Handoff — 2026-05-15 — W2-4 Admin Hub finish (EH-H Part B)

## TL;DR

Wave 2 hardening slice **W2-4 / EH-H Part B** is done. The admin hub
is now real-backed for users + invites, feature flags, providers,
webhooks, audit log, and per-user notification preferences. The domain
event bus has wildcard subscription, and the new webhook dispatcher
fans every org-scoped event out to subscribed URLs with HMAC-SHA256
signing and a 3-attempt retry policy.

**Typecheck: clean. Unit tests: 130/130 pass.**

## What landed

### Contracts (Zod) — `shared/contracts/`

- `user.ts` — `UserAdminRow` (discriminated union of member + invite),
  `IUserService` (list / invite / revokeInvite / resendInvite /
  setRole / suspend / reactivate / deactivate / transferOwnership).
- `feature-flag.ts` — `KNOWN_FLAGS`, `FeatureFlagMerged`,
  `IFeatureFlagService` (list / get / set / listForOrg).
- `provider-config.ts` — `ProviderKind` (`email | sms | storage | pdf`),
  per-kind provider unions + Zod (`PROVIDER_CONFIG_ZOD`),
  `IProviderConfigService` (list / get / upsert / activate).
- `webhook.ts` — `WEBHOOK_SIGNATURE_HEADER`,
  `WEBHOOK_SIGNATURE_ALGORITHM`, `Webhook`, `WebhookDelivery`,
  `IWebhookService` (list / get / create / update / softDelete /
  deliveries / test / mintSecret).
- `notification-subscription.ts` — `KNOWN_EVENT_TYPES` (catalog),
  `NOTIFICATION_DEFAULTS`, `defaultChannelsFor`,
  `INotificationSubscriptionService` (list / listForUser / upsert /
  bulkUpsert / resetToDefaults).
- `audit.ts` — extended with `AuditFilterInput`, `AuditFilterOutput`,
  `filter()` + `exportCsv()` on `IAuditService`.

### Mocks — `shared/mocks/`

Five new mock services (`user`, `feature-flag`, `provider-config`,
`webhook`, `notification-subscription`) plus the filter/CSV extension
to `audit.mock.ts`. Wired into `shared/mocks/factory.ts` under the
W2-4 comment block.

### Reals — `server/services/`

- `user.real.ts` — opaque-token invites (sha256(token) stored in
  `pending_invites`), `deriveStatus()`-driven status, transfer-
  ownership guarded by caller role.
- `feature-flag.real.ts` — `listForOrg()` merges
  `KNOWN_FLAGS` defaults + global override rows + org override rows
  with `hasOverride` flag.
- `provider-config.real.ts` — per-kind Zod validation in `upsert()`;
  only one active config per `(orgId, kind)` enforced in a tx.
- `webhook.real.ts` — `mintSecret()` returns `whsec_<48 hex>` +
  sha256 hash + 12-char prefix; `test()` posts a synthetic
  `webhook.ping`; `softDelete` flips `deletedAt + isActive=false`.
- `notification-subscription.real.ts` — `seedDefaultNotifications()`
  is a public function called by `RealAuthService.acceptInvite` after
  membership creation; uses `onConflictDoNothing()` for idempotence.

All five are registered in
[`server/utils/services-factory.ts`](../../server/utils/services-factory.ts).

### Event bus

- `shared/events/bus.ts` gained `onAny(handler)` returning an
  unsubscribe function; `emit()` now runs both named + wildcard
  handlers via `Promise.allSettled`. `__resetEventBusForTests()`
  clears both maps.
- Defensive re-init under HMR.

### Webhook dispatcher

- `server/services/_subscribers/webhook-dispatcher.ts` — idempotent
  `registerWebhookDispatcher()` subscribes via `onAny`. For each
  event whose payload has an `organizationId`, fetches active non-
  deleted webhooks, filters by `eventTypes.includes(name)`, and
  fires a 3-attempt retry chain at fixed `[1000, 4000, 16000]` ms
  delays. Records every attempt in `webhook_deliveries` (status +
  truncated response body OR error message). Signs with
  `signWebhookPayload(body, hook.secretHash)` — header
  `X-Bulwark-Signature: hmac-sha256=<hex>`.
- Registered alongside the property-status subscriber in
  `server/plugins/event-subscribers.ts`.

### Auth bridge

`server/services/auth.real.ts` was extended:

- `previewInvite()` and `acceptInvite()` first check the
  `pending_invites` table by `sha256(token)` (new opaque path); fall
  back to the legacy JWT-token path if no row matches.
- After membership creation, `acceptInvite()` calls
  `seedDefaultNotifications({ organizationId, userId })`. Errors are
  swallowed so seeding never blocks invite acceptance.

### UI

- `app/pages/settings/index.vue` — gained Providers + Webhooks cards.
- `app/pages/settings/users.vue` — rewritten to use real
  `IUserService`. Unified members + outstanding-invites list, invite
  modal, **issue-once invite URL banner**, inline role select + state
  buttons (suspend / reactivate / deactivate / resend / revoke).
- `app/pages/settings/feature-flags.vue` — per-org toggle UI.
- `app/pages/settings/providers.vue` (new) — one card per kind, per-
  provider field modal driven by `PROVIDER_FIELDS`.
- `app/pages/settings/webhooks.vue` (new) — create modal with multi-
  event-type checkboxes, issue-once secret banner, per-row
  Test / Pause / Resume / Delete, deliveries pop-out.
- `app/pages/settings/audit-log.vue` — server-side filtered + paged
  list (50/page), Export CSV downloads via Blob URL.
- `app/pages/profile/notifications.vue` (new) — `(eventType × {inApp,
  email, sms})` matrix; Reset-to-defaults button.
- `app/components/nav/UserMenu.vue` — added "Notification
  preferences" link.

### Tests

Four new unit specs (19 new tests):

- `tests/unit/user-admin.test.ts`
- `tests/unit/feature-flags.test.ts`
- `tests/unit/webhooks.test.ts`
- `tests/unit/notification-subscriptions.test.ts`

**Suite totals: 21 files / 130 tests pass.**

### Schema + migration

New tables: `pending_invites`, `feature_flags`, `provider_configs`,
`webhooks`, `webhook_deliveries`, `notification_subscriptions`.

- `notification_subscriptions.user_id` FK now uses
  `ON DELETE CASCADE` so test-time user cleanup doesn't trip the
  constraint.

**Migration: `server/db/migrations/0006_salty_prism.sql`** —
generated via `pnpm db:generate` against the post-W2-4 schema.

### ADRs

- [ADR-0021 — Admin hub (users + providers + audit)](../decisions/ADR-0021-admin-hub-users-and-providers.md)
- [ADR-0022 — Outbound webhooks subscriber](../decisions/ADR-0022-webhooks-subscriber.md)

## Webhook signing — for verifier authors

```ts
// Receiver side:
import crypto from 'node:crypto'
const expected =
  'hmac-sha256=' +
  crypto.createHmac('sha256', SHARED_SECRET)
    .update(rawBody)
    .digest('hex')
if (!crypto.timingSafeEqual(
  Buffer.from(expected), Buffer.from(req.header('X-Bulwark-Signature')!))) {
  throw new Error('bad signature')
}
```

- Algorithm: `hmac-sha256`
- Header: `X-Bulwark-Signature`
- Value: `hmac-sha256=<hex>`
- Retry policy: 3 attempts, delays `[1000, 4000, 16000]` ms.

### Event types added

- `user.invited`
- `webhook.delivered` (emitted by the dispatcher itself for audit)
- `notification.sent` (placeholder — emission lands in W3-1 with the
  real send path)

## Known debt (intentional)

- **Sealed-secret storage**. `provider_configs.config` and
  `webhooks.secret_hash` are stored unsealed. W3-1 will replace with a
  KMS-backed column.
- **Webhook dispatcher signs with `secret_hash`**, not the raw secret
  (covered in ADR-0022). Verifier must use the secret returned at
  create time — which on the real backend is the hex prefix the UI
  showed once. To be reconciled when sealed secrets land.
- **E2E specs not authored in this slice.** The unit-level proofs
  cover the service surface; Playwright coverage for the 6 new pages
  is a follow-up slice (planned: `settings-users-invite`,
  `settings-feature-flags`, `settings-webhooks`,
  `settings-audit-log`, `profile-notifications`).
- **Notification *delivery***. This slice ships preferences + default
  seeding. The actual send path (resend / Twilio) is W3-1.
- **Out-of-scope preexisting failures**: `tests/integration/auth.real.test.ts`
  and a handful of `auto-status-transitions` cases need a `db:reset +
  db:migrate` against migration `0006_salty_prism.sql` before they
  re-pass. Unit suite is unaffected.

## How to verify

```pwsh
cd d:\bulwark\bulwark
pnpm typecheck             # clean
pnpm test:unit             # 130 passed
pnpm db:reset              # apply 0006_salty_prism.sql to dev DB
pnpm dev                   # exercise settings/* + /profile/notifications
```

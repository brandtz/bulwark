# L03 — Comms Hardening (Email / SMS)

> **Phase:** A (Wave 2) · **Autonomy:** AUTO (provider secret at deploy)
> **Depends on:** — · **Owns gap-register:** §3.2.1–3.2.4 · **Decision:** ADR-0002

## Purpose
Email and SMS providers **silently fall back to a stub id** when unconfigured or on
HTTP error. In production this means password resets, invites, and notifications
**vanish with no operator signal**. This epic makes comms **fail-loud**: configured
providers must work, failures are surfaced/audited/retried, and admins can see
delivery health. Stubs remain only in dev/test (`BULWARK_NOTIFICATIONS_DISABLED=1`).

## Key decisions (ADR-0002)
- In production, a send against an **unconfigured or failing** provider raises a
  surfaced error (for transactional sends like reset/invite) and an **audited failure +
  metric + admin notification** (for fan-out notifications) — never a silent success.
- A `message_deliveries` ledger records every attempt: channel, provider, status
  (`sent|stubbed|failed`), provider id/error, related event. Drives an admin health view.
- Resend/Twilio adapters pin their API shape behind a typed wrapper + a contract test
  that runs in CI against a recorded/mocked response.

## Stories

### L03-S1 — Delivery ledger + outcome taxonomy
- **Schema:** `message_deliveries(id, org_id, channel, provider, to_hash, status, provider_msg_id,
  error, event_type, related_entity, created_at)`.
- **Server:** providers return a structured outcome; the notification subscriber + auth
  emails write a ledger row.
- **Tests:** integration — a stubbed send (dev) writes `status=stubbed`; a forced failure
  writes `status=failed` with error.

### L03-S2 — Fail-loud policy in production
- **Server:** email/sms adapters — when `NODE_ENV=production`:
  (a) **transactional** sends (reset, invite, MFA) throw on no-config/failure so the caller
  surfaces it; (b) **fan-out** sends record `failed` + emit `comms.delivery_failed` event +
  metric instead of returning a fake id.
- **Tests:** unit — prod + no provider → transactional throws; fan-out records failure (no
  silent stub). Dev/test unchanged.

### L03-S3 — Admin comms-health surface
- **Client:** `settings/providers.vue` gains a "Delivery health" panel — last 24h
  sent/failed per channel, "provider not configured" banner, recent failures with reason.
- **Server:** `notification`/provider service method `deliveryHealth({ orgId, window })`.
- **Tests:** e2e — admin with no email provider sees the warning banner; with failures sees
  the list; field role 403.

### L03-S4 — Provider adapter contract tests + retry
- **Server:** typed Resend + Twilio wrappers (pinned endpoint/version); transient HTTP
  failures retried (bounded) before recording `failed`.
- **Tests:** contract tests against recorded provider responses (success, 4xx, 5xx);
  retry path covered.
- **Acceptance:** in a staging env with a real key (sponsor-provided), a test email + SMS
  deliver and ledger shows `sent`; with the key removed, the admin health view shows the
  failure rather than the app pretending success.

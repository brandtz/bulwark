# ADR-0022 — Outbound webhooks subscriber

## Status

Accepted — 2026-05-15.

## Context

The domain event bus (ADR-0017) now has multiple subscribers
(`property-status`, soon notification-sender, soon webhook-dispatcher).
Wave 2 hardening adds outbound webhooks: customers register a URL +
event filter, and the bus fans out to every matching webhook.

The questions to settle: signing algorithm, retry semantics, failure
storage, and where the subscriber runs.

## Decisions

### 1. Signature: HMAC-SHA256, hex, single header

- **Algorithm**: `hmac-sha256` over the **raw JSON body**.
- **Header**: `X-Bulwark-Signature: hmac-sha256=<hex>`.
- The constants `WEBHOOK_SIGNATURE_HEADER` and
  `WEBHOOK_SIGNATURE_ALGORITHM` are exported from
  `shared/contracts/webhook.ts` so verifiers don't depend on stringly-
  typed magic.
- `signWebhookPayload(body, secret)` (`shared/utils/webhook-signature.ts`)
  is the canonical signer. `verifyWebhookSignature()` uses a constant-
  time compare so a verifier can be copy-pasted from the docs.

### 2. Retry: 3 attempts at 1s / 4s / 16s

- Total attempts: **3** (initial + 2 retries).
- Backoff: fixed `[1000, 4000, 16000]` ms between attempts.
- The retry loop runs inside a `void (async () => { ... })()` IIFE so
  the originating `emit()` does not block.
- Every attempt records a row in `webhook_deliveries` with
  `attempt`, `response_status`, `response_body` (truncated), and
  `error_message`. A delivery row is **always** written, success or
  failure — no audit gap.

### 3. Signed-with-hash — Phase 1 sec-debt

Today the subscriber signs payloads with `webhooks.secret_hash`
(SHA-256 hex of the raw secret) rather than the raw secret. The verifier
side cannot reconstruct the raw secret either, so this works, but it
deviates from the standard "user has the raw secret, we have the raw
secret, both run HMAC over it". W3-1 will introduce a sealed-secret
column and switch the dispatcher to sign with the raw value.

### 4. Subscriber registration & runtime

- `registerWebhookDispatcher()` is idempotent and registered from
  `server/plugins/event-subscribers.ts` alongside the property-status
  subscriber. It uses the new `onAny()` wildcard registration on the
  bus so every event with an `organizationId` payload is candidate for
  fan-out.
- Sync execution today; pg-boss promotion path is documented in the
  handoff but not implemented in this slice.

## Rejected alternatives

- **Per-message timestamp + signature (`v1,t=<ts>,v1=<hex>`)**. Stripe-
  style, but doubles the parsing burden in tests and verifiers. With
  delivery rows pinning the timestamp, we don't need the timestamp in
  the header for Phase 1.
- **Exponential jitter**. With three attempts the jitter benefits are
  marginal and complicate the integration test. Fixed table is easier
  to assert.
- **JWTs in lieu of HMAC**. JWT carries a payload duplicate of the body,
  doubling bandwidth for no gain — the body is already the canonical
  message.
- **Failing fast and giving up after a single attempt**. Customers'
  endpoints will occasionally 502 under deploy; one quick retry covers
  that without us building a separate "redrive" UI.

## Known debt

- `secret_hash` signing (covered above).
- No DLQ or admin redrive UI. The deliveries log is the only operator
  view today.
- No event-bus persistence. A server restart between `emit()` and the
  retry loop loses retries. pg-boss promotion fixes this.

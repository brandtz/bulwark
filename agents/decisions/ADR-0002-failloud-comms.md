# ADR-0002 — Fail-loud comms (no silent stub in production)

- **Status:** Accepted (2026-06-30) · **Epic:** L03

## Context
Email/SMS providers return a fake stub id when unconfigured or on HTTP error. In
production this silently drops password resets, invites, and notifications with no
operator signal.

## Decision
In production, a send against an **unconfigured or failing** provider must NOT return a
fake success. **Transactional** sends (reset, invite, MFA) **throw** so the caller
surfaces the failure. **Fan-out** notifications record a `failed` row in a new
`message_deliveries` ledger, emit a `comms.delivery_failed` event + metric, and surface
in an admin "delivery health" view. Stubs remain only in dev/test
(`BULWARK_NOTIFICATIONS_DISABLED=1`). Provider adapters are typed + contract-tested.

## Consequences
- Operators see comms problems immediately; users aren't told a reset email "was sent"
  when it wasn't.
- A delivery ledger gives auditability + a health surface.

## Alternatives rejected
- Keep silent stubs (data-loss class bug). Throw on every channel including best-effort
  fan-out (one bad channel shouldn't fail the whole event — hence the ledger split).

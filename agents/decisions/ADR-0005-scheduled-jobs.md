# ADR-0005 — Scheduled jobs via guarded endpoints + pg-boss

- **Status:** Accepted (2026-06-30) · **Epic:** L04, L05, L11

## Context
GDPR account-purge and COI-expiry scans exist as wrappers but are never scheduled
(purge = a compliance BLOCKER). Jobs also lack retries/idempotency and prod guards.

## Decision
Every recurring job is a **registered pg-boss JobKind** with a typed registry (adding a
kind without a handler is a typecheck error), a **retry/backoff** policy, and an
**idempotent** handler. The platform scheduler (Render/Vercel Cron) triggers work by
POSTing to **guarded admin endpoints** secured by a `BULWARK_CRON_SECRET` bearer
(constant-time) or super-admin session; the endpoint **enqueues** (work runs on the
worker). Production refuses stub flags (`BULWARK_PDF_STUB`, fs storage) at boot. Orphaned
`generating` docs are reconciled; runs emit audit + metrics and alert on failure streaks.

## Consequences
- GDPR erasure actually runs; COI buckets reflect real scans; transient failures self-heal.
- One pattern for all future scheduled work.

## Alternatives rejected
- In-process `setInterval` (dies with the serverless instance). Running heavy work in the
  cron HTTP request (timeouts; no retries). Leaving scheduling "to ops" (the current
  non-compliant state).

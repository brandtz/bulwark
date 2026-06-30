# L05 — Scheduled Jobs (GDPR purge + COI expiry)

> **Phase:** A (Wave 1) · **Autonomy:** AUTO · **Depends on:** L04
> **Owns gap-register:** §3.3.1 (BLOCKER), §3.3.2 · **Decision:** ADR-0005

## Purpose
Two job wrappers exist but are **never scheduled**:
- `account-purge.ts` — hard-deletes users past the 30-day soft-delete grace window.
  Without it, "right to erasure" is **violated** → launch BLOCKER.
- `coi-expiry-check.ts` — flags subcontractor COIs nearing expiry; the sub portal shows
  an "expiring" bucket fed by a scan that never runs → stale/false data.

This epic registers both as pg-boss JobKinds, triggers them on a schedule via guarded
admin endpoints (platform scheduler → HTTP), makes them idempotent + monitored, and
gives admins a manual "run now".

## Key decisions
- Scheduling model (ADR-0005): the platform scheduler (Render Cron / Vercel Cron) POSTs
  to guarded `server/api/admin/jobs/<name>.post.ts` endpoints secured by a
  `BULWARK_CRON_SECRET` bearer (constant-time compare) **and** super-admin session for the
  manual path. The endpoint enqueues the JobKind (work happens on the worker, not the web
  request).
- Every run writes an audit event + increments a metric; failures are Sentry-captured (L08).

## Stories

### L05-S1 — JobKinds + handlers for purge + COI scan
- **Server:** register `account_purge` and `coi_expiry_scan` in the L04 registry; handlers
  call `services.account.purgeExpiredDeletions()` and the COI scan across all active orgs.
- **Tests:** integration — purge handler hard-deletes only rows past grace; COI scan flags
  only COIs within the window; both idempotent.

### L05-S2 — Guarded trigger endpoints + scheduler wiring
- **Server:** `admin/jobs/account-purge.post.ts`, `admin/jobs/coi-expiry-scan.post.ts` —
  bearer `BULWARK_CRON_SECRET` OR super-admin session; enqueue + return run id.
  `render.yaml` (or `vercel.json`) cron entries: purge daily 02:00 UTC, COI nightly 03:00 UTC.
- **Tests:** e2e — wrong/no secret → 401; valid secret → 202 + enqueued; non-super session → 403.

### L05-S3 — Admin "run now" + last-run visibility
- **Client:** `settings/jobs.vue` (super-admin) — list scheduled jobs, last run time/result,
  "Run now" button per job; surfaces COI/purge counts.
- **Server:** small `job-runs` read model (or reuse audit) for last-run/status.
- **Tests:** e2e — super-admin triggers a run and sees the result; org-admin gets 403.

### L05-S4 — Monitoring + alerting hooks
- **Server:** each run emits metrics (`jobs.account_purge.{ok,fail}`, `jobs.coi_scan.*`) and,
  on 3 consecutive failures, a Sentry event + (if configured) an admin notification.
- **Tests:** unit — failure counter trips the alert hook at threshold.
- **Acceptance:** GDPR purge demonstrably runs on schedule in a staging dry-run; COI bucket
  reflects a real scan.

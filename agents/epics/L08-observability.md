# L08 — Observability Baseline

> **Phase:** A (Wave 2) · **Autonomy:** AUTO (Sentry DSN at deploy)
> **Depends on:** — · **Owns gap-register:** §3.7.1–3.7.4 · **Decision:** ADR-0007

## Purpose
There is no error tracking, no health/readiness endpoint, no metrics exposition, and
logs go to stdout only. The launch gate requires error tracking, structured logging,
metrics, and uptime monitoring. This epic wires a credential-ready observability
baseline that is a **no-op without secrets** (so it lands autonomously) and lights up
when the sponsor provides a Sentry DSN.

## Key decisions (ADR-0007)
- **Sentry** for errors + traces via a Nitro plugin; `init()` only when `SENTRY_DSN` is set
  (otherwise a no-op shim). Web + worker both instrumented. PII scrubbed via existing
  logger redaction list before send.
- **Health/readiness**: `/api/health` (liveness, public, cheap) and `/api/health/ready`
  (DB reachable + migrations current + storage reachable; admin/cron-bearer).
- **Metrics**: keep the in-process counters; add a `/api/metrics` Prometheus text exposition
  (admin/bearer) so an external scraper can pull.

## Stories

### L08-S1 — Sentry integration (web + worker), no-op without DSN
- **Server:** `server/plugins/sentry.ts` (web) + worker init; capture unhandled errors +
  5xx in the RPC dispatcher; release/env tags; scrub via logger redactor.
- **Tests:** unit — no DSN → init is a no-op; with DSN (mocked transport) a thrown handler
  error is captured once.

### L08-S2 — Health + readiness endpoints
- **Server:** `health.get.ts` (liveness) + `health/ready.get.ts` (DB ping + `migrations`
  drift check + storage head). Readiness fails (503) on drift or unreachable dependency.
- **Tests:** integration — ready returns 200 on a migrated DB; simulated drift → 503.
- **Acceptance:** deploy platform can gate traffic on readiness.

### L08-S3 — Prometheus metrics exposition + counters
- **Server:** `/api/metrics` text exposition (admin or `BULWARK_METRICS_BEARER`); add
  counters/histograms: request latency, job outcomes, comms deliveries, rate-limit blocks,
  auth failures.
- **Tests:** e2e — unauth → 401/403; authorized → valid Prometheus text; counters increment.

### L08-S4 — Request-latency instrumentation (feeds L10 perf gate)
- **Server:** middleware records per-route p50/p95 into the metrics registry + structured
  log line (method, route, status, ms, org-id-hash).
- **Tests:** unit — latency observed and bucketed; redaction intact.
- **Acceptance:** p95 per endpoint is observable for the L10 budget assertion.

### L08-S5 — Uptime monitor + runbook hooks
- **Docs/Config:** document an external uptime check against `/api/health`; on-call alert
  thresholds (error rate, readiness fail, job-failure streak) recorded in `docs/RUNBOOK.md`.
- **Acceptance:** a synthetic check + alert path is documented and testable in staging.

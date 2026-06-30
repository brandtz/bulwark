# ADR-0007 — Observability + infra baseline (credential-ready, no-op without secrets)

- **Status:** Accepted (2026-06-30) · **Epic:** L08, L16, L17

## Context
No error tracking, health/readiness, or metrics exposition; logs are stdout-only; prod
DB/deploy not finalized. The launch gate requires error tracking, structured logging,
metrics, uptime, and a safe deploy.

## Decision
Wire a **credential-ready** observability + infra baseline that is a **no-op without
secrets** (so it lands autonomously) and lights up when secrets arrive:
- **Sentry** (web + worker) initialized only when `SENTRY_DSN` is set; PII scrubbed via the
  logger redactor.
- **Health/readiness** endpoints (`/api/health`, `/api/health/ready` with DB + migration-
  drift + storage checks) so the platform gates traffic.
- **Metrics** exposed as Prometheus text for external scraping; request-latency histograms
  feed the L10 perf budget.
- **Managed Postgres** (Neon/Render) with migration-on-deploy, pooling, backups, and a
  bootstrap for the first customer org; **deploy** via Vercel (web) + Render (worker) with a
  post-deploy smoke canary and documented rollback (`docs/RUNBOOK.md`).

## Consequences
- Production failures are visible and recoverable; deploys are repeatable and reversible.

## Alternatives rejected
- Defer observability to post-incident (too late). Self-host metrics/error stack (overkill
  for one customer). Manual migrations (drift risk).

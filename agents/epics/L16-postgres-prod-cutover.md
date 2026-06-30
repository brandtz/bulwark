# L16 — Managed Postgres Production Cutover

> **Phase:** C (Wave 6) · **Autonomy:** SECRET (needs DATABASE_URL) · **Depends on:** L05, L07
> **Owns gap-register:** §3.12.1 · **Decision:** ADR-0007

## Purpose
Move from local Postgres to a managed production database (Neon or Render Postgres),
with migrations applied safely on deploy, connection pooling sized for serverless,
automated backups, and a startup drift check. Built-ahead on local PG; the sponsor
provides the production `DATABASE_URL`.

## Stories

### L16-S1 — Migration-on-deploy strategy
- **Server/CI:** a deploy step runs `drizzle` migrations against the target DB before traffic
  cutover; readiness (L08) fails on drift. Document idempotent re-run.
- **Tests:** integration — apply migrations to a fresh DB → ready; introduce drift → 503.

### L16-S2 — Connection pooling for serverless
- **Server:** configure a pooled connection (Neon pooler / pgBouncer) appropriate for Vercel
  serverless; bound worker pool (pg-boss) separately.
- **Tests:** load-smoke — concurrent requests don't exhaust connections.

### L16-S3 — Backups + restore drill
- **Ops/Docs:** enable automated backups + PITR; document a restore drill in `docs/RUNBOOK.md`.
- **Acceptance:** a documented, tested restore path exists.

### L16-S4 — Seed/bootstrap for the first customer org
- **Script:** production-safe bootstrap (the first GC org, admin user, Oregon standards seed,
  default pipelines/trades/programs) — guarded, idempotent, no demo data in prod.
- **Tests:** integration — bootstrap creates exactly the first-customer baseline; re-run = no-op.
- **Acceptance:** prod DB stands up from zero to a usable first-customer baseline on demand.

# ADR-0012 — Phase 2 Infrastructure Stack

**Status**: Accepted (2026-05-05)
**Supersedes**: nothing
**Superseded by**: nothing

## Context

Epic E11 (Backend Wiring) has been blocked since boilerplate on five
infrastructure decisions: Postgres host, auth strategy, object storage,
background-job runtime, and production hosting. Phase 1 (E0–E10) is
complete with 128 chromium / 35 unit tests passing against the mock
service layer; the next step is replacing each `Mock<X>Service` with a
real Drizzle-backed implementation. That swap cannot start without
locked-in choices for where the bytes actually live.

Sponsor was interviewed on 2026-05-05; this ADR records the answers as
binding decisions for Phase 2.

## Decision

### 1. Postgres
- **Local dev**: PostgreSQL 18 already installed on the sponsor's
  Windows workstation as the `postgresql-x64-18` service. Sponsor will
  create role `bulwark_app` + database `bulwark_dev` via pgAdmin and
  paste the connection string back into `bulwark/.env.local` (gitignored).
- **Staging / prod**: Neon (deferred until first deployment milestone;
  not blocking E11). Schemas, migrations, and Drizzle config are
  Postgres-flavour only — no SQLite or MySQL escape hatch.

### 2. Auth (E11-S3)
- **v1**: Email + password (`bcryptjs`) with session cookies via
  `nuxt-auth-utils`. Matches the existing mock `auth.login(email, pwd)`
  shape so zero UI churn.
- **Deferred**: Magic-link (Resend), Microsoft Entra SSO, Google
  Workspace SSO — all post-launch, customer-driven.

### 3. Object storage (E11-S10)
- **Cloudflare R2** for compliance-doc PDFs and future photo uploads.
  S3-compatible API, no egress fees, generous free tier. Signed URLs
  via the AWS SDK pointed at the R2 endpoint.

### 4. Background jobs (E11-S9)
- **`pg-boss`** running as a separate Node worker process against the
  same Postgres instance. No Redis dependency. Survives restarts via
  the `pgboss` schema. Worker process deploys alongside the Nuxt app
  on Vercel… *but* Vercel doesn't run long-lived workers, so the
  worker actually deploys to **Render** (or Railway) as a tiny Node
  service. Documented in E11-S9 itself.

### 5. Hosting
- **Vercel** for the Nuxt app (first-class Nuxt support, zero config).
- **Render / Railway** for the pg-boss worker (long-running Node
  process, picked at E11-S9).
- **Cloudflare** for R2 only.

### 6. Payments (E13-S7)
- **Stripe**. Sponsor has an account; will share test + restricted
  keys when E13-S7 starts. No alternative processor.

### 7. Phase 2 build order
- **Strict serial**: E11 (backend wiring) → E12 (subcontractor portal)
  → E13 (homeowner portal). No parallel public-marketing work even
  though E13-S1/S2 are technically auth-free — a single track keeps
  test surface area predictable.

### 8. Naming + branding
- "Bulwark" is a working name. No domain registered, no production
  email-from address yet. Transactional mail uses placeholder
  `noreply@bulwark.local` until the sponsor picks the real domain.
  All `*_FROM` env vars are placeholders; rename is a global
  search-and-replace once the brand lands.

## Consequences

### Positive
- E11 is unblocked the moment the local DB connection string lands.
- All five infrastructure picks are S3-compatible / Postgres-standard
  / Stripe-standard — no proprietary lock-in beyond Cloudflare R2
  (which itself is S3-API-compatible, so swappable).
- The pg-boss-on-the-same-DB choice means Phase 1's 128-test mock
  suite can be re-run against real Postgres via a single env flag
  flip, with no new infra to provision for tests.

### Negative
- Two hosting providers (Vercel + Render) instead of one. Acceptable;
  the worker is a single small process and Vercel functions don't fit
  the long-poll / queue-drain shape pg-boss needs.
- "Bulwark" as a working name means we'll do one renaming pass before
  customer rollout. Cheap; only affects copy + DNS, no schema change.

### Neutral
- Magic-link is deferred. Field crews and sub-contractors will type
  passwords on phones for v1. We can revisit if support tickets pile
  up around password-reset flows.

## Implementation notes (for whoever picks up E11-S1)

1. Sponsor creates `bulwark_app` role + `bulwark_dev` DB in pgAdmin,
   pastes `DATABASE_URL=postgresql://bulwark_app:...@localhost:5432/bulwark_dev`
   into `bulwark/.env.local`.
2. Add the missing schemas to `server/db/schema/` — assessments,
   quotes, work_orders, subcontractors, jobs, compliance_docs,
   invoices, audit_log, api_keys, standards. Every Phase 1 mock
   service has a Zod contract under `shared/contracts/` that pins
   the column shape.
3. `pnpm db:generate` produces the baseline migration; review the
   generated SQL before running.
4. `pnpm db:migrate` applies it.
5. Build `server/db/client.ts` (postgres-js singleton) and start
   the swap stories in dependency order: AuditService → Auth →
   Tenancy firewall → Property/Client → Assessment → Quote →
   WorkOrder/Sub → Job → Compliance → Invoice → ApiKey.

## References

- Sponsor interview transcript: 2026-05-05 (in-session).
- Phase 1 close: sha `387f3bc` (E10) + `a83ffb9` (Phase 2 deferral memo).
- Existing scaffolding: [drizzle.config.ts](drizzle.config.ts),
  [server/db/schema/index.ts](server/db/schema/index.ts),
  [.env.example](.env.example).

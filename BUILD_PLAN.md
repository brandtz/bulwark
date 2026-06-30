# Bulwark — Production Launch Plan (v2)

> **Status:** Active master plan. Supersedes the v1 build plan
> ([archived](agents/archive/v1-BUILD_PLAN.md)).
> **Created:** 2026-06-30 · **Owner:** agentic delivery team · reviewed by sponsor (Matthew).
> **Cursor:** [`BUILD_STATUS.md`](BUILD_STATUS.md) · **Evidence:** [`PRODUCTION_GAP_REGISTER.md`](PRODUCTION_GAP_REGISTER.md)

---

## 1. Purpose & launch definition

v1 took Bulwark from demo to a **feature-complete pre-production app** (42 services,
all role portals, ~140 e2e tests). This plan takes it to a **real production launch
for a first customer**: a single general-contractor organization running the full
quote-to-cash + compliance workflow, with all four role portals **plus** a net-new
insurer surface, real money movement, and enterprise-grade non-functionals.

### Launch scope (locked — see interview 2026-06-30)
- **Tenancy:** one real GC org at go-live (multi-tenant remains; no scale stress test).
- **Portals required:** Admin web · Field PWA · Subcontractor · Homeowner · **+ NEW
  Insurance Company Representative** (read-only, multi-property reporting).
- **Compliance:** Oregon now, **data-driven seam** for other states (no hardcoding).
- **Payments:** **Stripe** online invoice payments (checkout + webhooks + reconciliation).
- **Integrations (credential-ready now; sponsor supplies secrets):** Cloudflare R2,
  Email (Resend/SES), managed Postgres (Neon/Render), Twilio SMS, Sentry.
- **Offline:** online-only acceptable at launch (offline = fast-follow).
- **No hard deadline:** optimize for correctness and **autonomous throughput**.

---

## 2. Launch quality gates (the non-negotiable DoD for GA)

A build is **launch-ready** only when ALL hold:

| Gate | Bar |
|---|---|
| **Functional** | Every required portal flow works end-to-end against the **real** backend (no mock fallback) for the first-customer org. |
| **Security** | OWASP Top-10 review complete; automated SAST + dependency scan green in CI; CSRF protection on all state-changing requests; secrets sealed at rest; tenant firewall test-enforced; no `data:`/`local://` persisted asset URLs in prod. |
| **Accessibility** | WCAG 2.1 AA: automated axe-core gate green on every page; manual keyboard + focus pass on primary flows. |
| **Performance** | API p95 < 400 ms on primary list/detail endpoints; Lighthouse ≥ 90 (perf + a11y + best-practices) on the top 10 routes, enforced in CI. |
| **Reliability** | pg-boss retry/backoff on all jobs; crons scheduled + monitored; orphaned-state reconciliation; health/readiness endpoint; migration-drift startup check. |
| **Observability** | Error tracking (Sentry) capturing 5xx; structured logs with redaction; metrics exposition; uptime monitor. |
| **Per story** | Zod contract for every new shape; real service + mock parity; unit + Playwright (happy + ≥1 negative + permission-gating); typecheck + eslint + vitest + e2e green. |
| **Data** | UNIQUE constraints on user-facing sequences (quote/invoice #); composite indexes on hot tables; no known N+1 on list endpoints. |

---

## 3. Locked decisions (formalized as fresh ADRs in `agents/decisions/`)

| # | Decision | ADR |
|---|---|---|
| D1 | Real, pluggable **object-storage service** (driver = R2 in prod, filesystem in dev/test); contract rejects `data:`/`local://` in production. | ADR-0001 |
| D2 | **Fail-loud comms**: a missing/broken email/SMS provider raises a surfaced, audited error + admin signal — never a silent stub — in production. | ADR-0002 |
| D3 | **Stripe** for online payments via hosted Checkout + signed webhooks; `invoice_payments` ledger is the reconciliation source of truth; amounts validated server-side. | ADR-0003 |
| D4 | **Insurance Company Representative** role: read-only, single-GC-org membership, scoped to an explicit `insurer_links` linkage, multi-property reporting only; zero write surface. | ADR-0004 |
| D5 | **Scheduled jobs** run as registered pg-boss JobKinds triggered by the platform scheduler hitting guarded admin endpoints; every job is idempotent + retried + monitored. | ADR-0005 |
| D6 | **Security baseline**: double-submit CSRF tokens, org MFA-enforcement policy, prod env fail-closed guards, CI SAST/dep-scan. CSP nonce is an explicit post-launch follow-up. | ADR-0006 |
| D7 | **Observability baseline**: Sentry + structured logs + metrics + health checks; all credential-ready, no-op without secrets. | ADR-0007 |
| D8 | **Quality gates as CI**: axe-core a11y gate, Lighthouse budget, API latency assertion — wired into CI, not aspirational. | ADR-0008 |
| D9 | **Compliance standards are data** per tenant/program; `OREGON_DEFAULT_STANDARDS` is a seed, not a code path. | ADR-0009 |
| D10 | **Doc-vs-code truth**: header comments + status prose are verified against code each wave; stale claims are bugs. | ADR-0010 |

---

## 4. Epic catalog (L-series)

Each epic file lives at `agents/epics/L<NN>-<slug>.md` and contains its full story
breakdown. **Autonomy** marks whether a sponsor secret/decision is required.

| ID | Epic | Phase | Autonomy | Depends on |
|---|---|---|---|---|
| **L01** | Object Storage Service (R2 driver + dev/test driver + prod URL guard) | A | AUTO (R2 secret at deploy) | — |
| **L02** | Asset uploads migrated to storage (photos, attachments, avatars, logos) | A | AUTO | L01 |
| **L03** | Comms hardening (fail-loud email/SMS, delivery log, admin signal, retries) | A | AUTO (provider secret at deploy) | — |
| **L04** | Async-job hardening (retry/backoff, OOM guard, prod stub guards, reconciliation) | A | AUTO | — |
| **L05** | Scheduled jobs (account-purge GDPR, COI-expiry) wired + monitored | A | AUTO | L04 |
| **L06** | Data layer (indexes, race-safe numbering + UNIQUE, N+1, cursor pagination) | A | AUTO | — |
| **L07** | Security hardening (CSRF, MFA policy, tenant-firewall test, env guards, SAST) | A | AUTO | — |
| **L08** | Observability (Sentry, metrics exposition, health/readiness, log shipping) | A | AUTO (Sentry secret at deploy) | — |
| **L09** | Accessibility WCAG 2.1 AA (field tab bug, axe-core gate, focus/aria sweep) | A | AUTO | — |
| **L10** | Performance budget (Lighthouse CI, API p95 instrumentation, query tuning) | A | AUTO | L06 |
| **L11** | Document completeness (homeowner invoice PDF, compliance hardening, branded templates) | A | AUTO | L01, L04 |
| **L12** | Settings persistence completeness (company, branding upload, templates, permissions) | A | AUTO | L01 |
| **L13** | Portal depth (homeowner + sub detail views, sub profile/settings) | A | AUTO | — |
| **L19** | Compliance multi-state seam (de-hardcode Oregon into standards data) | A | AUTO | — |
| **L14** | Stripe payments (checkout, webhooks, reconciliation, refunds, homeowner pay) | B | SECRET (Stripe test keys autonomous) | L06, L11 |
| **L15** | Insurance Representative role + insurer portal (linkage, reports, firewall) | B | AUTO | L06, L07 |
| **L16** | Managed Postgres prod cutover (Neon/Render, migrate-on-deploy, backups) | C | SECRET | L05, L07 |
| **L17** | Production deploy & runbook (env registry, secrets checklist, canary, rollback) | C | SECRET | all A/B |
| **L18** | Legal & content finalization (Terms/DPA TBDs, effective dates) | C | HUMAN | — |
| **L20** | Launch QA gate (full role×portal e2e, OWASP scan, a11y/perf sign-off) | C | AUTO | all |

---

## 5. Per-story Definition of Done

1. **Contract**: Zod schema in `shared/contracts/` for any new shape (no inline shapes).
2. **Parity**: real service implemented **and** mock parity kept; both satisfy the contract.
3. **Tenant safety**: every org-scoped method calls `assertSameTenant`; proven by test.
4. **Validation**: inputs Zod-parsed at the boundary; errors mapped to correct status.
5. **Tests**: Vitest unit (pure logic) + Playwright (happy + ≥1 negative + permission gate).
6. **Quality gates**: typecheck, eslint, vitest, e2e, axe-core, and (for UI) Lighthouse budget pass — each gate applies **once its harness exists** (see note below).
7. **Security**: no secret in logs; state-changing requests carry CSRF; no plaintext-at-rest regressions.
8. **Observability**: meaningful audit events + metrics on new server paths.
9. **Docs truth**: header rationale block accurate to the code; no stale claims.
10. **Cursor**: `BUILD_STATUS.md` advanced; handoff note in `agents/handoffs/`.

> **Gate-substrate sequencing:** the axe-core (L09-S2), Lighthouse/latency (L10-S1/S2),
> CSRF (L07-S1), and tenant-firewall (L07-S3) harnesses are themselves deliverables. To keep
> the DoD honest, these four are **pulled forward into Wave 1** as the "gate substrate"; until
> a given harness lands, its gate is N/A for earlier stories rather than a blocker. Every
> story authored after a harness exists MUST pass it.

---

## 6. Sequencing — autonomous-first waves

Per sponsor priority ("prioritize all work that can be done without human
intervention"), build order front-loads `AUTO` work and builds `SECRET` work
**credential-ready** (test-mode/no-op) so it lands without waiting on the sponsor.

- **Wave 1 — Foundations + gate substrate (AUTO):** L01 → L02, L04 → L05, L06, plus the gate
  substrate L07-S1 (CSRF), L07-S3 (tenant-firewall test), L09-S2 (axe-core), L10-S1 (Lighthouse).
  (Storage, jobs, data, and the CI gates every later story is held to.)
- **Wave 2 — Safety & signals (AUTO):** L07, L08, L03. (Security, observability, comms.)
- **Wave 3 — Quality (AUTO):** L09, L10, L19. (A11y, perf, compliance seam.)
- **Wave 4 — Surfaces (AUTO):** L11, L12, L13, L15. (Docs, settings, portals, insurer.)
- **Wave 5 — Money (SECRET test-mode autonomous):** L14.
- **Wave 6 — Launch (SECRET/HUMAN):** L16, L17, L18, then L20 sign-off.

Within a wave, independent epics may proceed in parallel where they don't touch the
same files. Each epic still merges story-by-story behind green gates.

---

## 7. Human-gated items registry (the ONLY things that need the sponsor)

These are built **credential-ready and test-verified** without the sponsor; they
flip to "live" when the secret/decision arrives. Nothing else blocks on a human.

| Item | What's needed from sponsor | Built-ahead state |
|---|---|---|
| Cloudflare R2 | Account id, bucket, access keys | Storage service + filesystem driver; R2 driver behind env. |
| Email (Resend/SES) | API key + verified from-domain | Provider adapter + fail-loud + delivery log; stub in test. |
| Twilio SMS | SID/auth/from-number | Adapter + fail-loud; stub in test. |
| Stripe | Account; test + live keys; webhook secret | Full flow against **Stripe test mode**; live = key swap. |
| Managed Postgres | Neon/Render DATABASE_URL | Migrations + health check; runs on local PG today. |
| Sentry | DSN | SDK wired no-op without DSN. |
| Legal copy | Counsel-approved Terms/DPA + governing law/entity | Pages render; `TBD` tokens flagged. |
| Domain/DNS/TLS | Production hostname | Security headers + HSTS gated to prod. |

---

## 8. Risks (live)

| Risk | Mitigation |
|---|---|
| Stale docs misdirect work (already happened — see gap register §1). | ADR-0010 truth-sweep each wave; skeptical sub-agent review of every plan/claim. |
| Stripe correctness (double-charge, webhook replay). | Idempotency keys + signed-webhook verification + ledger as source of truth + test-mode e2e. |
| Insurer role leaks cross-tenant data. | Read-only contract + `insurer_orgs` firewall + persona×route matrix test for the new role. |
| R2/credential drift breaks uploads silently. | Prod URL guard + storage health check + fail-loud. |
| Chromium OOM on the worker. | Retry/backoff + memory flags + circuit-breaker + render plan note. |

---

## 9. Cursor

Active state lives in [`BUILD_STATUS.md`](BUILD_STATUS.md). Read it before doing anything.

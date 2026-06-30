# L07 — Security Hardening

> **Phase:** A (Wave 2) · **Autonomy:** AUTO · **Depends on:** —
> **Owns gap-register:** §3.5.1–3.5.6 · **Decision:** ADR-0006

## Purpose
Close the OWASP-relevant gaps required by the launch security gate: add explicit
CSRF protection to state-changing requests, an org-level MFA enforcement policy,
test-enforced tenant isolation, production fail-closed env guards, a CI SAST/
dependency scan, and the doc-vs-code truth sweep (fixing the stale `user_mfa`
comment that masqueraded as a vulnerability).

## Key decisions (ADR-0006)
- **CSRF:** double-submit token. On SSR, mint a random token into a non-HttpOnly cookie
  + session; a server middleware requires a matching `X-CSRF-Token` header on
  `POST/PUT/PATCH/DELETE` to `/api/**` (exempt: signed webhooks, cron-bearer endpoints).
- **MFA policy:** `org_settings.mfa_mode ∈ disabled|optional|required`; when `required`,
  a middleware forces enrolment before protected routes for that org's members.
- **CSP nonce** is explicitly **out of scope for launch** (documented follow-up); current
  header set stays, with `unsafe-inline` noted.

## Stories

### L07-S1 — CSRF double-submit middleware
- **Server:** `server/middleware/02.csrf.ts` — verify header==cookie token on unsafe methods;
  plugin/composable to attach the header in the RPC proxy + form posts; exempt webhook +
  cron-bearer routes.
- **Tests:** e2e — unsafe POST without/with wrong token → 403; with token → ok; webhook +
  cron endpoints still work without it.
- **Acceptance:** all RPC mutations carry CSRF; negative path blocked.

### L07-S2 — Org MFA enforcement policy
- **Schema/contract:** add `mfa_mode` to `org_settings` + contract.
- **Server/Client:** middleware enforces enrolment when `required`; `settings/security.vue`
  (admin) toggles the mode + shows a roster of who has MFA.
- **Tests:** e2e — `required` org bounces an un-enrolled member to MFA setup; `optional`
  does not; admin sees the roster.

### L07-S3 — Tenant-firewall coverage test + grep gate
- **Tests:** an integration test enumerates every org-scoped real-service method and
  asserts a cross-tenant call throws `TenantViolationError`; an eslint/CI check flags any
  new org-scoped method lacking `assertSameTenant`.
- **Acceptance:** 100% of org-scoped methods proven tenant-safe; regression-gated.

### L07-S4 — Production env fail-closed guards (consolidated)
- **Server:** one `server/utils/env-guard.ts` asserting at boot (prod): `BULWARK_BACKEND=real`,
  `BULWARK_PDF_STUB!=1`, `BULWARK_STORAGE_DRIVER=r2`, comms providers present or explicitly
  acknowledged, session/JWT secrets ≥32 chars, `DATABASE_URL` not localhost.
- **Tests:** unit — each misconfig throws a clear, specific error in a simulated prod env.

### L07-S5 — CI SAST + dependency scan (OWASP gate)
- **CI:** add `pnpm audit --audit-level=high` (or `osv-scanner`) + a static scan (e.g.
  `eslint-plugin-security` rules) to the pipeline; fail on high/critical.
- **Tests/Acceptance:** CI job green on a clean tree; a seeded vulnerable dep fails the gate.

### L07-S6 — Doc-vs-code truth sweep
- **Task:** fix the stale `user_mfa.secret_encrypted` "plaintext" comment (it IS AES-GCM
  encrypted). **Fix the phantom firewall API in active docs:** [CONVENTIONS.md](docs/CONVENTIONS.md#L222),
  [BULWARK_TECH.md](docs/BULWARK_TECH.md#L249), and [BULWARK_HANDOFF.md](docs/BULWARK_HANDOFF.md#L68)
  all instruct builders to call `requireOrgMembership` from `server/utils/tenancy.ts` — a file
  that **does not exist**; the real firewall is `assertSameTenant`. Update those docs. Fix the
  stale ADR cross-refs in [_shared.ts](shared/contracts/_shared.ts#L10) ("ADR-0002 + ADR-0008"
  now point at archived ADRs) when that file is touched for the L15 role addition. Grep for
  other header comments contradicting code (storage seams, "Phase 2" that already shipped).
- **Acceptance:** no active doc or header comment instructs a builder to use a non-existent
  API; no header comment contradicts the code it documents on changed files.

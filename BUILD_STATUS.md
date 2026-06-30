# Bulwark — Build Status (Production Launch / v2)

> **Live cursor.** Read this before doing anything. Updated by every agent at session end.
> **Plan:** [`BUILD_PLAN.md`](BUILD_PLAN.md) · **Evidence:** [`PRODUCTION_GAP_REGISTER.md`](PRODUCTION_GAP_REGISTER.md)
> **v1 history archived:** [`agents/archive/`](agents/archive/)

---

## Current phase

**Phase A — Autonomous Hardening (Wave 1: foundations).**

## Active epic

[L01 — Object Storage Service](agents/epics/L01-object-storage.md) — 🟢 ready to start.

## Active story

**L01-S2 — Presign endpoints + tenant firewall.** Next action: add
`server/api/storage/presign-upload.post.ts` + `presign-download.post.ts` (authenticated,
tenant-scoped via `assertSameTenant`, MIME/size validation via `validateUpload`, rate-limited)
returning signed URLs from `getStorage()`.

**L01-S1 — DONE (2026-06-30):** storage contract ([storage.ts](shared/contracts/storage.ts)),
driver interface + `FsDriver` (HMAC-signed dev URLs) + `R2Driver` (presigned PUT/GET, fail-
closed env) + env selector (`selectStorageDriverName`, prod→r2) + dev serve/store handlers +
14 unit tests (green). eslint + typecheck clean; `.data/` gitignored.

## Wave plan (autonomous-first)

| Wave | Epics | State |
|---|---|---|
| 1 — Foundations + gate substrate | L01, L02, L04, L05, L06 + L07-S1/S3, L09-S2, L10-S1 | ▶ in progress (L01) |
| 2 — Safety & signals | L07, L08, L03 | queued |
| 3 — Quality | L09, L10, L19 | queued |
| 4 — Surfaces | L11, L12, L13, L15 | queued |
| 5 — Money | L14 (Stripe test mode) | queued |
| 6 — Launch | L16, L17, L18, L20 | queued (secret/human-gated) |

## Done this session (2026-06-30) — planning reset

- Two exhaustive read-only audits (frontend surfaces; backend/security/data/jobs).
- **Skeptical verification** overturned 3 false-positive "HIGH" findings (MFA encryption,
  reports real, mock prod-blocked) — recorded in gap-register §1.
- **Full reset:** archived 15 v1 epics + 37 v1 ADRs + old plan/status to `agents/archive/`.
- Authored: new `BUILD_PLAN.md`, `PRODUCTION_GAP_REGISTER.md`, 20 L-series epics with story
  breakdowns, 10 fresh ADRs, this cursor.
- **Skeptical sub-agent review complete** (adversarial): found 2 P0 + 4 P1 defects, all in the
  two net-new epics (L14 Stripe, L15 insurer) + DoD sequencing. **All resolved** with no sponsor
  question — insurer reuses the homeowner single-org membership pattern; Stripe event→invoice key
  = Checkout metadata; balance guard moved into the orchestrator before insert; gate-substrate
  pulled into Wave 1; phantom `requireOrgMembership` doc-drift logged to L07-S6.
- **Verdict after revision:** Waves 1–4 build-ready with zero sponsor questions. Next: L01-S1.

## Quality gates (every story) — see BUILD_PLAN §2/§5

typecheck · eslint · vitest · Playwright (happy + negative + permission) · axe-core ·
Lighthouse/latency budget (UI) · tenant-firewall · CSRF · docs-truth.

## Human-gated registry (built credential-ready; do NOT block on these)

R2 keys · Email/SMS provider keys · Stripe keys + webhook secret · managed `DATABASE_URL` ·
Sentry DSN · counsel-approved legal copy · production domain/TLS. (BUILD_PLAN §7.)

## Blockers

_None for autonomous work._ The GDPR account-purge cron (gap §3.3.1) is the one functional
BLOCKER and is owned by **L05** in Wave 1.

## Open questions for sponsor

_None blocking._ Insurer role scope assumptions (GC-admin-granted links, read-only) are
recorded in [ADR-0004](agents/decisions/ADR-0004-insurer-role.md); flag if different.

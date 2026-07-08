# Bulwark — Build Status (Production Launch / v2)

> **Live cursor.** Read this before doing anything. Updated by every agent at session end.
> **Plan:** [`BUILD_PLAN.md`](BUILD_PLAN.md) · **Evidence:** [`PRODUCTION_GAP_REGISTER.md`](PRODUCTION_GAP_REGISTER.md)
> **v1 history archived:** [`agents/archive/`](agents/archive/)

---

## Current phase

**Phase A — Autonomous Hardening (Wave 1: foundations).**

## Active epic

Wave 1 continuing: **L02** (asset-upload migration) is the next epic to start.
L01 ✅ · L04 ✅ · L05 ✅ (see below) · L12-S1/S2 pulled forward ✅.

## Active story

**L02-S1 — wire property photos onto the storage service.** Blocking
preconditions logged in gap §3.1.7/3.1.8 (finalize etag pinning + per-entity
RBAC on presign-download) must be closed as part of L02, not before it.
Not yet started this session — this session was spent verifying/repairing
the Cowork handoff (see below) before starting new epic work.

## Done this session (2026-07-07, GitHub Copilot verification session)

Picked up [`HANDOFF_TO_COPILOT.md`](HANDOFF_TO_COPILOT.md) §0 ("first actions
before any new feature work"). All 6 Cowork commits landed (see commit log);
two **real, systemic bugs** were found and fixed during verification —
neither was introduced by Cowork, both were latent and only surfaced on a
true single-worker full real-backend e2e run (the first one ever recorded):

1. **`app/composables/useLabel.ts` SSR crash (critical, fixed).** The label
   override fetch was fire-and-forget on the server with its in-flight
   `Promise` stored in a `useState` (serialized into the SSR payload). Any
   page whose own data-fetch resolved faster than the label fetch hit a
   page-wide 500 ("Cannot stringify a Promise or thenable") — this was
   silently failing ~30% of all authenticated routes (work-orders, quotes,
   invoices, settings, dashboard) whenever Playwright ran single-worker.
   Fixed by wrapping the initial load in `onServerPrefetch` so Nuxt actually
   waits before serializing. See lessons memory + commit `061f49c`.
2. **`scripts/db-seed.mjs` wipe-order FK violation (fixed).** `inspections`/
   `inspection_responses` FK into `properties` but were wiped AFTER
   `properties` in the demo-org reset block — any spec creating a real
   inspection row (e.g. `inspection-dynamic.spec.ts`) poisoned every
   subsequent per-spec `reseedRealBackend()` call for the rest of the run.
   Fixed by moving the inspections wipe earlier. Commit `c360062`.
3. Also fixed stale `settings-matrix.spec.ts` card-count assertions (hub has
   grown to 19 org_admin-visible / 21 super_admin-visible cards over several
   past epics, not just this session's new Jobs card) — commit `2016377`.

**Verification results after fixes:** `pnpm typecheck` ✅, `pnpm lint` ✅,
`pnpm test:unit` ✅ (453/453), `pnpm db:migrate` ✅ (0012 applied),
`pnpm test:e2e` (chromium, single-worker, `BULWARK_BACKEND=real` exported in
the host shell — see lessons memory, this env var must be set in the
invoking shell, not just relied on via `webServer.env`'s default) — **153/176
passed, 23 failed, 14 skipped.** Remaining 23 failures are a **pre-existing,
un-investigated cluster**, not caused by this session: most assert a
`Q-{year}-{seq}` quote-number format (`toContainText('Q-')`,
`/Q-\{year\}-\{seq:04\}/`) but the real seeded/generated format is
`QUOTE-2026-00001` — this looks like the exact numbering-format gap L06 (gap
§3.6.2) already owns. Left for L06 rather than patched here. A few others
(dashboard chart svg, field-check-in job detail, property-depth nav) look
like independent stale-selector drift — not triaged individually this
session; flag if they recur once L06 lands.

## Done previous session (2026-07-06, Claude Cowork session)

> ⚠️ Run `pnpm typecheck` + `pnpm test:e2e` locally before committing — the
> Cowork sandbox ran eslint, a server/shared tsc slice, and the FULL vitest
> suite (453 tests, real fresh Postgres) green, but cannot run vue-tsc whole
> or Playwright. Handoff: [`agents/handoffs/S-2026-07-06-001-cowork-wave1.md`](agents/handoffs/S-2026-07-06-001-cowork-wave1.md).

- **L01-S4 — DONE.** `GET /api/health/storage` (org_admin/super_admin):
  put→head→delete driver probe (latency + fail-soft) + org-scoped legacy
  placeholder census over 7 asset columns (guard-identical normalization,
  soft-delete aware, avatars flagged intentional-inline). Contract schemas in
  `shared/contracts/storage.ts`; logic in `server/services/storage/health.ts`
  + `legacy-report.ts`. 7 unit + 3 integration tests + e2e spec authored.
  **L01 epic complete.**
- **L04 — DONE (S1–S5).** `server/jobs/policy.ts` typed retry registry
  (3× exponential, per-kind expireIn; queue + send level); worker prod
  env-guard (`env-guard.ts`, minimal until L07-S4); Puppeteer protocolTimeout
  + setContent/pdf timeouts; compliance `create()` enqueue-failure guard
  (doc → `failed`, audited, rethrow); `reconcileGenerating()` +
  `reenqueue()` on compliance service (contract + mock parity); registry
  exhaustiveness enforced by `Record<JobKind, …>` types. 10 unit + 5
  integration tests.
- **L05 — DONE (S1–S4).** JobKinds `account_purge` + `coi_expiry_scan`
  (migration 0012 adds enum values); worker handlers (purge = global sweep;
  COI = all-live-orgs loop, per-org counts, partial-failure tolerant);
  guarded triggers `POST /api/admin/jobs/{account-purge,coi-expiry-scan}`
  (constant-time `BULWARK_CRON_SECRET` bearer OR super_admin session; 202 +
  enqueue); Render cron blocks in `render.yaml` (02:00/03:00 UTC);
  `/settings/jobs` super-admin surface (run history via `_runSummary`, Run
  now); consecutive-failure tracker (one-shot system-error audit at 3) +
  `jobs_succeeded_total` metric. **The GDPR account-purge BLOCKER (gap
  §3.3.1) is closed pending prod scheduler config.** e2e spec authored.
- **L12-S1/S2 pulled forward (sponsor directive: no "coming soon" in
  portals).** `/settings/company` is a real editor (org name + brand color
  via new `orgSettings.get/updateOrganizationProfile`, audited, Zod-parsed,
  slug immutable; mock parity). `/settings/templates` is a real editor over
  `pdf.declaration` / `pdf.footer` labels, and the compliance renderer now
  consumes them + branding (license label, heading color, support contact)
  with XSS-escaping + color validation — 4 renderer unit tests. Homeowner
  invoice "PDF coming soon" hint replaced with truthful copy (real PDF stays
  L11); org-switcher singleton copy de-futurized.
- **Bugs found & fixed (fresh-DB integration run — first ever):**
  1. Auto-status subscriber passed literal `'system'` into uuid
     `actor_user_id` via pipeline first-touch synthesis → every
     auto-transition failed on a fresh DB. Fix: `SYSTEM_USER_ID` sentinel +
     `resolveActorUserId()` in `shared/mocks/tenant.ts`, adopted by
     status-pipeline/job/compliance services. 3 previously-failing
     integration tests now pass.
  2. `event.context.session` was never populated by any middleware →
     `POST /api/jobs/coi-expiry-check` (W3-4) 403'd every caller since it
     shipped. Fixed to resolve the session via `services.auth.currentUser()`
     (the /api/metrics pattern).
  3. Drizzle snapshot drift: `provider_configs.config_encrypted` existed in
     DB + schema but not in migration meta — folded into 0012's snapshot.

## Wave plan (autonomous-first)

| Wave | Epics | State |
|---|---|---|
| 1 — Foundations + gate substrate | L01 ✅, L04 ✅, L05 ✅ → **L02**, L06 + L07-S1/S3, L09-S2, L10-S1 | ▶ in progress |
| 2 — Safety & signals | L07, L08, L03 | queued |
| 3 — Quality | L09, L10, L19 | queued |
| 4 — Surfaces | L11, L13, L15 (+ rest of L12) | queued (L12-S1/S2 done early) |
| 5 — Money | L14 (Stripe test mode) | queued |
| 6 — Launch | L16, L17, L18, L20 | queued (secret/human-gated) |

## Quality gates (every story) — see BUILD_PLAN §2/§5

typecheck · eslint · vitest · Playwright (happy + negative + permission) · axe-core ·
Lighthouse/latency budget (UI) · tenant-firewall · CSRF · docs-truth.

## Human-gated registry (built credential-ready; do NOT block on these)

R2 keys · Email/SMS provider keys · Stripe keys + webhook secret · managed `DATABASE_URL` ·
Sentry DSN · counsel-approved legal copy · production domain/TLS ·
**`BULWARK_CRON_SECRET` + `BULWARK_APP_URL` on Render cron + Vercel** (new, L05).

## Blockers

_None for autonomous work._ GDPR purge cron: **code + schedule config shipped**
(render.yaml); goes live when the Render cron service is provisioned with its
two env vars (L17 checklist).

## Open questions for sponsor

_None blocking._ Insurer role scope assumptions recorded in
[ADR-0004](agents/decisions/ADR-0004-insurer-role.md); flag if different.

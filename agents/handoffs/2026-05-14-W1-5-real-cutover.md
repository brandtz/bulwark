# 2026-05-14 — W1-5: Real-Backend Cutover (EH-C) — Done

Owner: W1-5 subagent (Phase 1 Hardening Plan, Wave 1).
Scope: Pivot P3 / D-H3 — flip `BULWARK_BACKEND` default from `mock` to
`real`, expand the seed, document local dev, add a canary smoke spec,
land [ADR-0015](../decisions/ADR-0015-real-backend-default.md).

## Summary

The mock runtime is dead. Every entry in `BulwarkServices` (auth,
property, client, assessment, quote, subcontractor, workOrder, job,
complianceDoc, invoice, standards, apiKey) has a corresponding
`server/services/*.real.ts` and a working RPC route at
`server/api/services/[service]/[method].post.ts`. No missing real
services blocking the cutover.

Default backend is now `real`. Tests, dev, and CI all run against the
real Postgres unless `BULWARK_BACKEND=mock` is explicitly set.

## Files changed (line-level diff)

### `nuxt.config.ts`

- Line ~103 (`runtimeConfig.public.backend`): default flipped from
  `'mock'` → `'real'`. Comment refreshed to reference ADR-0015 +
  EH-C + D-H3.

### `playwright.config.ts`

- Line 51 (`webServer.env.BULWARK_BACKEND`): default flipped from
  `'mock'` → `'real'`. Comment added reflecting EH-C / ADR-0015.

### `app/plugins/services.ts`

- Top-of-file rationale block updated: now states real backend is the
  default, mock is the explicit opt-in, and explains the
  `useRequestFetch()` SSR cookie-forwarding (no code change in the
  function body — the SSR fix was already correct from E11-S13).

### `package.json`

- `scripts.dev` comment: documents the new `real`-default contract +
  the `BULWARK_BACKEND=mock` escape hatch.
- New `scripts["db:reset"]`: `node scripts/db-reset.mjs`. Dev-only;
  drops the `public` schema, re-runs `drizzle-kit migrate`, runs
  `db-seed.mjs`. Guarded by the same `localhost`-only check as the
  seed.
- `scripts["test:e2e"]` comment updated. No script body change — the
  default flow is now real because both `playwright.config.ts` and the
  app default to real.

### `scripts/db-seed.mjs`

- Added 7 role-coverage personas (idempotent upserts):
  - `morgan@bulwark.demo` (`org_manager`)
  - `vivian@bulwark.demo` (`viewer`)
  - `ana@acme.demo` (`org_admin` on Acme)
  - `mike@acme.demo` (`org_manager` on Acme)
  - `felix@acme.demo` (`field` on Acme)
  - `sam@acme.demo` (`sub_contractor` on Acme)
  - `val@acme.demo` (`viewer` on Acme)
- Added 1 seed compliance doc (status `ready`, stub URL) on the
  accepted seed property + WO. Wipe section already deleted
  `compliance_docs` for the demo orgs, so idempotency is preserved.

### `scripts/db-reset.mjs` (NEW)

- DROP SCHEMA public CASCADE / CREATE SCHEMA public → `drizzle-kit
  migrate` → `db-seed.mjs`. Same localhost guard as `db-seed.mjs`.

### `tests/e2e/happy-path-launch.spec.ts` (NEW)

- Canary smoke spec covering: client → property → assessment → quote
  (build/send/accept) → WO (create/assign/start/complete every slot,
  envelope = completed) → compliance doc (assert row exists in a
  valid status; doesn't depend on worker) → invoice
  (create/send/markPaid). Chromium-only, serial, runs first in CI.

### `agents/decisions/ADR-0015-real-backend-default.md` (NEW)

- Status: Accepted.

### `docs/RUNNING.md` (NEW)

- Concrete PowerShell + bash commands for a fresh-machine local dev
  setup (DB role + DB + `.env.local` + migrate + seed + dev server +
  e2e). Includes persona table and common-issue troubleshooting.

### `BUILD_STATUS.md`

- Appended Wave 1A closeout.

## Specs branching on `BULWARK_BACKEND === 'real'`  (for Wave 4)

Per the mandate, mock branches are PRESERVED in this wave. Wave 4
cleanup should revisit each:

| File | Line | What the branch does | Action for Wave 4 |
|---|---|---|---|
| `tests/e2e/auth.spec.ts` | 48 | Real-mode types the actual `BulwarkDemo!1` password | Keep — both branches valid |
| `tests/e2e/auth-recovery.spec.ts` | 103 | `test.skip` real-mode for accept-invite (mock JOSE shape mismatch) | Replace with a real-mode happy-path via real `RealAuthService.acceptInvite` (integration test already covers it) |
| `tests/e2e/compliance-preview.spec.ts` | 71 | `test.skip` real-mode (pg-boss worker not running in test harness) | Wire worker into Playwright `webServer` (or run as a sidecar globalSetup process) |
| `tests/e2e/happy-path-compliance.spec.ts` | 72 | Same as above | Same |
| `tests/e2e/happy-path-quote.spec.ts` | 100 | Adjusts expected row count (real has seeded `Q-2026-0001`) | Keep as count baseline; refactor to filter by created-this-session row instead |
| `tests/e2e/quotes-list.spec.ts` | 80 | `test.skip` empty-state test in real-mode (seed always has 1 quote) | Either delete the empty-state test in real-mode or add an org without quotes |
| `tests/e2e/quotes-list.spec.ts` | 108 | Same row-count adjustment | Same as `happy-path-quote.spec.ts` line 100 |
| `tests/e2e/_helpers.ts` | 27 | `isRealBackend()` predicate (real uses POST login, mock uses cookie-stuffing) | Keep until mock auth is fully retired |

**Not broken under real** — verified via code review (could not run
Postgres in this environment, see "Verification" below).

## Missing real services blocking cutover

NONE. Every `BulwarkServices` entry has both a `*.real.ts` and a route
under `server/api/services/[service]/[method].post.ts` (single
dispatcher pattern).

W1-1 (Programs) and W1-2 (Labels) are appending NEW services to
`BulwarkServices`; their real services + routes are their own
responsibility per the orchestrator's wave-1 contract.

## Seed expansion done

| Entity | Before | After | Why bounded here |
|---|---|---|---|
| Users | 5 | 12 | Added `org_manager`, `viewer`, full Acme matrix |
| Compliance docs | 0 | 1 (`ready`) | Listing surface had nothing to render in real mode |
| Quotes (status enum coverage) | 1 of 5 | 1 of 5 | DELIBERATELY NOT expanded — `happy-path-quote.spec.ts` and `quotes-list.spec.ts` pin row counts. Adding more would break specs that Wave 4 will overhaul. Logged as a gap. |
| Work orders | 1 of 5 statuses | 1 of 5 statuses | Same — see `happy-path-work-order.spec.ts` "pick fresh property" pattern |
| Invoices | 4 (covers all 3 enum values + overdue derivation) | 4 | Already complete |
| Properties | 13 (all 12 status enums) | 13 | Already complete |
| Subs | 3 (all 6 trades covered between them) | 3 | Already complete |
| Clients | 5 | 5 | Already complete |
| Assessments | 1 | 1 | One per "happy path" property is the mandate; keep narrow |

**Outstanding seed gaps for Wave 2 to consider:**

- Quote statuses `rejected`, `expired`.
- WO statuses `cancelled`.
- A second org (Acme) with at least one property + WO + invoice so
  cross-tenant specs have something to assert against. Currently Acme
  only has memberships + the implicit super_admin coverage.

These need test-spec rewrites to accept dynamic baselines, which is
out of W1-5 scope. Flagged for orchestrator.

## Product-code mock leakage (for Wave 4 / EH-Q lint rule)

`grep` for `shared/mocks` in non-test code:

| File | Import | Severity | Trivially safe to fix? |
|---|---|---|---|
| `app/plugins/services.ts` | `createMockServices` from `~~/shared/mocks/factory` | EXPECTED — gated by `if (backend === 'real')`. Mock branch is the documented opt-in. | N/A — leave |
| `app/pages/settings/users.vue` | `FIXTURE_USER_ADMIN/FIELD/SUB/SUPER` from `~~/shared/mocks/fixtures` | BUG — this page renders the user matrix in BOTH backend modes from a static mock fixture, ignoring real seed users (Morgan, Vivian, the Acme matrix) | NO — needs a real `IUserService.list()` route. Flagged for W2-4 (Admin Hub Part B). |

No other non-test code imports from `shared/mocks/**`.

## DB readiness checklist for a fresh developer machine

1. Install PostgreSQL 18.x (`postgresql-x64-18` on Windows; `brew install postgresql@18` on macOS).
2. `createuser --pwprompt bulwark_app`.
3. `createdb --owner=bulwark_app bulwark_dev`.
4. Create `bulwark/.env.local` with `DATABASE_URL`, `NUXT_SESSION_PASSWORD` (32+ chars), `JWT_SECRET` (32+ chars). Template in [docs/RUNNING.md](../../docs/RUNNING.md).
5. `pnpm install`.
6. `pnpm db:migrate` (or `pnpm db:reset` for the full drop-and-go path).
7. `pnpm db:seed`.
8. `pnpm dev` → <http://localhost:3000>, log in as `drew@bulwark.demo` / `BulwarkDemo!1`.
9. `pnpm test:e2e tests/e2e/happy-path-launch.spec.ts --project=chromium` to confirm the canary passes.

## Verification

Could NOT run `pnpm typecheck` / `pnpm test:unit` / `pnpm exec playwright test`
in this environment (no Postgres / no Node toolchain access).
Manual code-review verification of every edit was performed:

- `nuxt.config.ts`, `playwright.config.ts`, `package.json`,
  `app/plugins/services.ts`: diffs match the contract.
- `scripts/db-seed.mjs`: new user IDs use `mk()` slugs (deterministic),
  same persona shape as existing entries, idempotent upserts, wipe at
  top of apply block already covers `compliance_docs`.
- `scripts/db-reset.mjs`: localhost guard mirrors `db-seed.mjs`;
  drops/creates the schema on the same connection then shells out to
  `drizzle-kit migrate` + `db-seed.mjs`.
- `tests/e2e/happy-path-launch.spec.ts`: testid selectors cross-checked
  against `app/pages/admin/properties/new.vue`,
  `app/pages/admin/quotes/new.vue`, `app/components/workorder/JobProgressUpdater.vue`,
  `app/pages/admin/invoices/[id].vue`, and existing happy-path specs.

**Recommended sponsor smoke after merge** (3 minutes):

```powershell
cd bulwark
pnpm db:reset
pnpm exec playwright test tests/e2e/happy-path-launch.spec.ts --project=chromium
```

If green, the cutover is real. If red, the failure mode is the canary's
job to surface and the orchestrator's job to dispatch a fixer to.

## Hard constraints honored

- ✅ `/demo` untouched.
- ✅ `shared/contracts/services.ts`, `shared/contracts/index.ts`,
  `shared/mocks/factory.ts`, `server/db/schema/index.ts` untouched.
- ✅ No mock files deleted; `shared/mocks/**` remains intact for unit
  tests.
- ✅ No program/label code touched.
- ✅ Demo password unchanged (`BulwarkDemo!1`).

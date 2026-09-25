# 03 — Test Strategy: proving work instead of rubber-stamping it

> Applies to every WP. The skeptic reviewer uses this document as the checklist.

## 1. The four layers

| Layer | Tool | What it proves | Where |
|---|---|---|---|
| **Unit** | Vitest | pure logic: money math, evaluators, sort/filter, policies, template rendering | `tests/unit/*.test.ts` |
| **Integration** | Vitest against real Postgres (`tests/setup/env.ts` loads `.env.local`) | services enforce tenant firewall, transitions, immutability, race safety; real ⇄ mock parity | `tests/integration/*.real.test.ts` |
| **Behavior e2e** | Playwright (chromium + mobile-safari + mobile-chrome) | user flows across pages (existing 76 specs, kept and migrated) | `tests/e2e/*.spec.ts` |
| **Screen contract** | Playwright `screens` project (opt-in: `pnpm test:screens`) | each design screen: viewports, dark, axe, test ids, role gate, touch targets, **every SPEC state**, **every SPEC action positive+negative**, visual parity vs design | `tests/e2e/screens/<ID>.spec.ts` |

Run both backend drivers for e2e (`BULWARK_BACKEND=real` is default; `mock` lane in CI).
Remember the repo lesson: export `BULWARK_BACKEND=real` in *your shell* before `pnpm test:e2e`,
or Playwright silently parallelizes against one Postgres and cascades failures.

## 2. Adversarial standards (what "challenge the work" means)

Every acceptance bullet in a WP needs **at least one of each** that applies:

1. **Negative path** — the thing that must *not* happen: forbidden role can't see/click AND the API returns 403 when called directly (`page.request.post('/api/services/<svc>/<method>', …)`); illegal transition rejected server-side even when the UI is bypassed; oversize/invalid input rejected at the boundary where it lands (not just where it's declared — see L01-S2 lesson).
2. **Boundary** — exact thresholds: 30 vs 31 days COI expiry, 8h vs 8h01 overtime, 48px vs 47px targets, AA contrast 4.5:1 exactly, page size N vs N+1, empty prior period in KPI deltas, DST/month-crossing dates.
3. **Cross-tenant** — same request with another org's id → `TenantViolationError` (extend `tests/unit/tenant-firewall.test.ts` for every new service method).
4. **Idempotency / replay** — webhooks, job retries, finalize, imports: run twice, assert one effect.
5. **State-machine** — for every persisted async state (`generating→ready→failed`, `pending→confirmed`, `queued→syncing→synced|conflict`, invoice/quote/job/slot/inspection enums): test each transition and at least one illegal one.
6. **Persistence round-trip** — write via UI, reload, read back identical (inspection field kinds, filters in URL, saved views, theme).
7. **Concurrency** — where two actors can collide (numbering, slot assignment, offline conflict): parallel requests in an integration test.
8. **Mutation sanity** (QA lane) — the matrix suite includes a documented "if you weaken gate X, test Y fails" pair so the suite is provably non-tautological.

Forbidden patterns (skeptic rejects): asserting only that a page "is visible"; snapshotting
the app against itself; `test.skip` without an ED/ADR reason; mocking the component under test;
loosening a tolerance without a per-screen comment; deleting a failing test to go green.

## 3. Screen-contract suite (UI/UX walk-through)

Generated per design ID:

```
pnpm codegraph:build                 # graph knows every received SPEC
pnpm screen:scaffold AD-12           # → tests/e2e/screens/AD-12.spec.ts with fixmes
pnpm screen:baseline AD-12           # → __baselines__/AD-12-{desktop,mobile,dark}.png from design HTML
pnpm test:screens -- -g AD-12        # run just this screen
pnpm screen:audit WP-B2              # gate: no fixme, states covered, negatives present
```

The contract (`_contract.ts`) contributes automatically: render at each viewport with zero
console/page/request errors; dark mode via tokenized surfaces; axe serious/critical = 0 in
light and dark; SPEC test ids attached; role gate for all seeded personas; touch targets ≥48px
at 390. The agent fills in: one test per SPEC **state** (make it reachable with real data, assert
what shows *and* what must not show) and one per SPEC **action** (permitted role succeeds with
side-effect asserted; forbidden role has no control *and* API 403; confirm ladder honored).

Visual parity compares the live page to a PNG rendered from the design HTML (`_visual.ts`).
Mask dynamic regions; never compare against a previous app screenshot.

## 4. Flow suites (happy paths as regression anchors)

Keep `tests/e2e/happy-path-*.spec.ts`; add one per design flow when its screens land:
`FL-1` lead→inspection (WP-B2/B4), `FL-2` findings→quote→accept→job (WP-B5 + WP-F2), `FL-3`
schedule→field→deliverable→stakeholder (WP-B6/B9 + D + G), `FL-4` invoice→pay→receipt (WP-B8 +
F2 + L14), `FL-5` invite→first-run per role (WP-S1), `FL-6` offline→sync→conflict (WP-D2),
`FL-7` change order (WP-B5 + F2), `FL-8` second program setup (WP-C2; the integration acid test
in WP-X1 is its backend twin), `FL-9` warranty ticket (WP-H6), `FL-10` purchase→receive→cost (WP-H3/H5).
Storyboards: `agents/design/return/design-return/A/flows/FL-n.md`.

## 5. Persona × route × action matrix (WP-Q2)

Generated from the graph: every received SPEC's Actions table (permission column) × seeded
personas → `tests/e2e/_matrix.generated.json`; the spec iterates it. Coverage requirement:
100% of actions in received SPECs. The matrix also drives API-level negatives through the RPC
dispatcher (`/api/services/[service]/[method]`).

## 6. Quality gates in CI

| Gate | Threshold | Job |
|---|---|---|
| typecheck, lint, unit | green | `ci.yml quality` |
| e2e (mock lane) | green | `ci.yml e2e` |
| e2e (real lane) | green | to add with L16 (Neon branch per PR) |
| codegraph fresh + registry valid + no overlaps | green | `codegraph.yml` |
| screen audit | report (blocking per-WP at review time) | `codegraph.yml` |
| axe serious/critical | 0 per screen (inside screen suite) | screens project |
| Lighthouse a11y ≥95, perf budget | per route (WP-L08) | to add |
| SAST / dep scan | no high | WP-L07 |

## 7. Test data

- Seed personas: `scripts/db-seed.mjs` (`drew@` admin, `morgan@` manager, `matthew@` field,
  `jeff@` sub, `vivian@` viewer, `sasha@` super, `homer@` homeowner, ACME org twins for
  cross-tenant). Add a `stakeholder` persona in WP-G1 and register it in `tests/e2e/screens/_contract.ts` `PERSONAS`.
- Design sample data (`agents/design/return/design-return/A/SAMPLE-DATA.json`) is for visual
  baselines; do **not** seed it into the DB — use masks for dynamic regions instead.
- Destructive specs reseed via `tests/e2e/_reseed.ts`.

## 8. Skeptic review protocol

A different agent/session than the implementer reads the WP, the diff, and the tests, and
produces an **actionable list** with file:line evidence: P0 (security/tenancy/money/data loss),
P1 (acceptance not actually proven, negative missing, state untested), P2 (nits). Verify each
finding against source before reworking — skeptics can be wrong (ADR-0010). `done` requires zero
open P0/P1. Record the review summary in the PR and any generalizable lesson in `agents/program/LESSONS.md`.

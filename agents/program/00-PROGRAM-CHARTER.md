# 00 — Program Charter: Bulwark → Horizontal Contractor Platform

> **Read this first** if you are any agent or human about to touch this repository.
> It defines how the rebuild is organized, who decides what, and how work moves.
> Companion documents in this folder: `01-REARCHITECTURE-PLAN.md` (what changes and why),
> `work-packages.json` (the only place scope/status lives), `03-TEST-STRATEGY.md` (how we
> prove work), `04-AGENT-PLAYBOOK.md` (how to pick up and finish a package),
> `ENGINEERING-DECISIONS.md` (binding answers to design questions).

## 1. Mission

Adopt the Claude Design system (Packet A) across the entire product, rebuild every existing
screen against its received SPEC, generalize the data model away from wildfire-specific
shapes, and then build the horizontal modules (price book, scheduling, purchasing, time,
job costing, warranty) — with every increment proven by adversarial tests and a Playwright
screen-contract suite that compares the live app to the design.

## 2. Non-negotiables

1. **The design return is the spec.** `agents/design/return/design-return/**/SPEC.md` plus
   `components/SPEC.md` are the source of truth for UI. Where a SPEC is not yet received, an
   architect-approved *ahead SPEC* in `agents/design/ahead/<ID>/SPEC.md` (same template) stands in.
2. **Decisions are written, never assumed.** Open questions → `ENGINEERING-DECISIONS.md`
   (ED-nnn). Architecture changes → `agents/decisions/ADR-*.md`. Cite IDs in PRs.
3. **Scope lives in one file.** `work-packages.json` is the registry. No work happens
   outside a WP; no WP is invented without an architect adding it there.
4. **Tests challenge, not confirm.** Every acceptance bullet has a negative test. Every
   screen has a contract spec with all states and forbidden-role assertions. `test.fixme`
   is a debt marker that blocks review, not a way to pass.
5. **Contracts first.** Zod contract → mock service → real service → parity test → UI.
   Both drivers stay green.
6. **Tenant firewall and money rules are inviolable.** `assertSameTenant` on every
   org-scoped method; integer cents everywhere.
7. **Query the CodeGraph before grepping.** It is an approximate navigation aid, not evidence of test coverage or security. Rebuild after structural changes. Generated graphs and local design exports are ignored; CI regenerates its own graph. A checkout without design artifacts must not claim they were received.

## 3. Roles

| Role | Who | Owns |
|---|---|---|
| **Sponsor / operator** | Matthew | Priorities, design sessions with Claude Design, go/no-go per phase |
| **Head Architect** | Copilot (this session) or whichever agent is invoked with the `architect` brief | `01-REARCHITECTURE-PLAN.md`, ED/ADR registers, WP creation & sizing, ahead SPECs, phase gates |
| **Implementing agents** | Any: Copilot, Codex, Claude Code, human | One WP at a time; follow `04-AGENT-PLAYBOOK.md` |
| **Skeptic reviewer** | A *different* agent/session than the implementer | P0/P1/P2 findings with file:line evidence; blocks `done` |
| **QA lane** | Agent on WP-Q* packages | Harness, matrix, visual baselines, CI gates |

## 4. Phases and gates

| Phase | Content | Exit gate |
|---|---|---|
| **0 Foundation** | WP-A1…A6 (tokens, primitives, composites, shells, vocabulary/routes), WP-Q1/Q2 (harness, matrix), WP-X1 (contract generalization), WP-O1 (codegraph/CI) | `/dev/ui` visually matches `components/INDEX.html` (all specimens); second-program acid test green; full e2e suite green on both drivers; nav has no dead routes |
| **1 Shared** | WP-S1…S3 (auth, errors, legal, notifications, palette, account) + HRD WP-L03 | All 24 SH screen specs pass with zero fixme; persona matrix green |
| **2 Admin core** | WP-B1…B6 + WP-X2/X3 + HRD WP-L06/L07/L08 | 28 AD screen specs pass; happy-path e2e (property→inspection→quote→job) green; Lighthouse a11y ≥95 on every admin route |
| **3 Admin rest** | WP-B7…B10 (design-ahead) + WP-L14 Stripe | Ahead SPECs reconciled with received SPECs (delta WPs opened if needed) |
| **4 Portals** | WP-D1/D2, E1, F1/F2, G1 | Field 390/1024 contracts pass; portal isolation adversarial tests pass |
| **5 Settings** | WP-C1…C4 | Pipeline/template versioning integration tests pass; manager read-only variants verified |
| **6 Modules** | WP-H1…H6 | Each module's schema has migration down(); property-based math tests pass |
| **7 Docs & long-term** | WP-J1/J2, I1/I2, L16 | Launch QA gate (L20) |

A phase may start before the previous fully exits **only** for packages whose `dependsOn`
are all `done` (the registry + `pnpm codegraph:check` enforce this).

## 5. Parallelization model

- **Lanes** (`DS`, `SCR`, `BE`, `QA`, `HRD`, `OPS`) are independent streams. At any time up to
  one WP per lane may be `in-progress` per agent; more is fine if file globs don't overlap.
- **File-glob ownership**: a WP declares `files`; `codegraph:check` fails if two `in-progress`
  WPs overlap. Need a file another WP owns? Coordinate in that WP's `agentNotes` or split.
- **Branch per WP**: `wp/<ID>-<slug>`. One PR per WP (XL WPs are split first). Squash-merge.
- **Design ahead**: SCR WPs whose designs are pending may run only with `designAhead: true`
  and an ahead SPEC approved by the architect.

## 6. Definition of done (per WP)

1. All `acceptance` bullets demonstrated by tests listed in `tests` (with negatives).
2. Screen WPs: `pnpm screen:audit <WP>` passes (no fixme, all states covered, negative assertions present).
3. `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:e2e` green on `BULWARK_BACKEND=real` and `mock`.
4. `pnpm codegraph:sync` and `pnpm codegraph:check` green; graph regenerated locally, never committed. Required runtime assets and fixtures must be tracked outside the ignored design exports.
5. Skeptic review with zero P0/P1 open; findings & responses recorded in the PR.
6. `work-packages.json` status → `done`, `pr` filled; lessons (if any) appended to `/memories/repo/lessons.md` equivalent: `agents/program/LESSONS.md`.

## 7. Communication artifacts

- **Status**: `agents/codegraph/work-packages.md` (generated) — the dashboard.
- **Decisions**: `ENGINEERING-DECISIONS.md`, `agents/decisions/ADR-*`.
- **Lessons**: `agents/program/LESSONS.md` (append-only; one paragraph per lesson, cite WP).
- **Design intake**: `agents/design/return/INTAKE-REPORT.md` (update when new packets land).

# Autopilot Checkpoint — 2026-05-14 (Phase 1 Hardening)

## Status snapshot

| Wave | Slices | Status |
|---|---|---|
| **1A** | W1-1 Programs (GC-generalization) · W1-2 CMS Labels + Branding · W1-5 Real-Backend default cutover | ✅ DONE |
| **1B** | W1-3 Admin Config Hub Part A (status pipelines + trades + numbering/defaults) · W1-4 State Continuity Engine (event bus + auto-transitions + bi-dir nav + activity timeline) | ✅ DONE (incl. wiring W1-3 ↔ W1-4 pipeline check) |
| **2** | W2-1..W2-6 (property depth, inspection templates, Q/WO/Inv depth, admin hub Part B, auth hardening, design polish) | ⏸ BLOCKED — Copilot session rate limit hit on dispatch. Resets ~3h12m from 2026-05-14T20:24Z. Resume by re-dispatching the six W2 prompts. |
| **3** | Cross-cutting + portals | ⏳ Queued |
| **4** | Regression sweep + ADR ratification | ⏳ Queued |

## What landed this session

- Master plan: [PHASE1_HARDENING_PLAN.md](PHASE1_HARDENING_PLAN.md)
- Migrations: `0002_opposite_zuras.sql` (programs + labels + branding) and `0003_crazy_gorilla_man.sql` (pipelines + nodes + trades + org_settings).
- New contracts: program, label (incl. branding), status-pipeline, trade, org-settings, audit (timelineForProperty extension).
- New tables (8): `programs`, `program_memberships`, `labels`, `org_branding`, `status_pipelines`, `status_pipeline_nodes`, `trades`, `org_settings`.
- Event bus + catalog under `shared/events/`, with property-status subscriber pointing at the real pipeline check.
- New settings pages: `/settings/programs`, `/settings/labels`, `/settings/branding`, `/settings/pipelines`, `/settings/trades`, `/settings/numbering-defaults` (+ hub cards).
- Property/WO/Invoice detail pages now show Linked Work + Activity timeline (bi-directional nav).
- `BULWARK_BACKEND` default flipped to `real` in `nuxt.config.ts` + `playwright.config.ts`. Mock retained for tests only. `docs/RUNNING.md` documents the local-Postgres path; `pnpm db:reset` script added.
- Smoke spec `tests/e2e/happy-path-launch.spec.ts` for the full pipeline canary.
- ADRs: 0013 (GC programs), 0014 (CMS labels), 0015 (real-backend default), 0016 (status pipelines as data), 0017 (event bus).
- 58/58 unit tests pass. Typecheck clean. Several new Playwright specs queued (require running Postgres to execute).

## Bugs / TODOs flagged by Wave 1 (queued for Wave 2)

- `app/pages/settings/users.vue` renders from a static mock fixture even under real backend — owned by **W2-4**.
- Trade `TradeSchema` Zod enum still frozen; widen to read trades catalog at runtime — owned by **W2-3** (also referenced by W2-4 numbering generator consolidation).
- Specs branching on `process.env.BULWARK_BACKEND === 'real'` (quotes-list, happy-path-quote, compliance-preview, auth-recovery) need cleanup once full real-backend coverage is verified — Wave 4.
- Six w2 prompt drafts are inlined in the orchestrator transcript at the tool call site labeled "W2-X" — copy/paste-resumable.

## How to resume

When the rate limit resets:
1. Re-read this file + `agents/handoffs/2026-05-14-W1-*.md`.
2. Re-dispatch the six Wave 2 subagents from the prompts in the orchestrator transcript (or re-author from the slice list in `PHASE1_HARDENING_PLAN.md` §4 Wave 2 — the table-of-deliverables per slice still holds).
3. After Wave 2: dispatch Wave 3 (notifications, reporting, mobile/PWA, sub+homeowner portal scaffolds, search/observability).
4. Wave 4: regression sweep + ADR ratification + BUILD_STATUS finalization.

## What sponsor should expect on return

- Plan + foundations are solid; the platform is now GC-generic (not wildfire-only), labels are CMS-configurable, mocks are demoted to test-only, status pipelines are admin-editable, and cross-feature state continuity has a working event bus + auto-transition engine.
- Domain depth (property hierarchy, inspection templates, quote tiers / change orders / partial payments, scheduling, dispatch board) is the next wave and is ready to fire as soon as limits clear.

— orchestrator

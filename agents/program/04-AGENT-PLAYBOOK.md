# 04 — Agent Playbook (Copilot · Codex · Claude Code · human — identical procedure)

> You are about to work on Bulwark. Follow this exactly; it is how parallel agents avoid
> colliding and how work gets accepted. Keep answers short; put evidence in tests and PRs.

## 0. Orientation (5 minutes, every session)

```
cat AGENTS.md                                   # repo entry point (this playbook is linked)
cat agents/program/00-PROGRAM-CHARTER.md        # rules
pnpm codegraph:sync && pnpm codegraph:check    # hash-sync the map; must be green before you start
cat agents/codegraph/work-packages.md           # dashboard: what is startable
```

Conventions you must know (from `CONVENTIONS.md`, `agents/program/LESSONS.md`, memory):
- Contract-first: `shared/contracts/*.ts` (Zod) → `shared/mocks/*.mock.ts` → `server/services/*.real.ts` → parity test.
- UI gets services via `useService('<name>')`; never import a service class.
- Every org-scoped method: `assertSameTenant(resolver, organizationId)`.
- Money is integer cents (`shared/utils/money.ts`).
- Labels via `useLabel().t(ns, key, default)`; never hardcode status/role/trade strings.
- Status colors via `data-hue` + `--hue-*`; never a hex or semantic class per status.
- Uploads: presign → PUT → finalize → persist key (see `agents/program/LESSONS.md`).
- e2e against real backend: `$env:BULWARK_BACKEND='real'` in *your* shell first.

## 1. Claim a work package

1. Pick a WP whose status is `ready` (dashboard "Startable now"). Confirm with the sponsor/architect if more than one agent is active in the same lane.
2. Edit `agents/program/work-packages.json`: `status: "in-progress"`, `owner: "<agent> (<date>)"`, `branch: "wp/<ID>-<slug>"`.
3. `pnpm codegraph:sync && pnpm codegraph:check` — must pass (no overlaps, deps done). Commit this as the first commit on your branch.
4. Read everything the WP points at:
   - `pnpm codegraph:query -- wp <ID>` (files matched, designs, decisions)
   - each design SPEC (`agents/design/return/design-return/<P>/screens/<ID>-*/SPEC.md`) **and** its `desktop.html`/`mobile.html`/`states.html` — the HTML is the visual truth
   - `components/SPEC.md` sections for every component named
   - every ED in `decisions[]` (`agents/program/ENGINEERING-DECISIONS.md`)
   - `pnpm codegraph:query -- route <route>` and `-- impact <file>` for what you'll touch

## 2. Before writing code

- For SCR WPs: `pnpm screen:scaffold <ID>` for each design; `pnpm screen:baseline <ID>`. Read the generated fixmes — that is your test plan.
- For BE WPs: write the contract change + a failing integration test first (tenant negative included).
- Write down in the PR description: the acceptance bullets you will prove and the test file for each.
- If something in the SPEC contradicts an ED/ADR or the code's reality, **stop and add an ED** (append to `ENGINEERING-DECISIONS.md` with a new number; cite it) — don't silently choose.

## 3. While implementing

- Stay inside your WP's `files` globs. Need a file outside? Either it's a bug in the WP (propose a glob addition in the same PR) or it belongs to another WP (leave a note in that WP's `agentNotes`; do not edit it).
- Additive changes to shared primitives only (new props/variants); mark removals `@deprecated` for one phase.
- Keep mock and real services in lockstep; run `pnpm test:unit` and the relevant `tests/integration/*.real.test.ts` continuously.
- After structural changes run `pnpm codegraph:sync`; do not commit the ignored generated graph. `pnpm codegraph:repair` repairs stale or damaged caches. The tracked design catalog provides IDs only; UI workers need the approved local extract. Promoted runtime assets/tests must work without that extract.
- Never delete or `skip` a failing test to go green. Fix the code or record an ED.

## 4. Before requesting review

```
pnpm typecheck && pnpm lint && pnpm test:unit
$env:BULWARK_BACKEND='real'; pnpm test:e2e          # then also BULWARK_BACKEND=mock
pnpm test:screens -- -g "<ID>"                       # for each design in the WP
pnpm screen:audit <WP-ID>                            # SCR WPs: must pass
pnpm codegraph:sync && pnpm codegraph:check
```
Set `status: "review"` in the registry with `pr`. In the PR: acceptance → test mapping table, list of negatives, any EDs added, anything out of scope you noticed (as follow-up WP proposals, not code).

## 5. Skeptic review (done by a *different* agent)

Prompt to use verbatim:

> Review WP <ID> on branch <branch>. Read `agents/program/03-TEST-STRATEGY.md` §2 and §8. For each acceptance bullet in `work-packages.json`, find the test that proves it and the negative that challenges it; if either is missing, that is a P1. Check tenant firewall on every new/changed service method (P0 if missing). Check money math uses integer cents (P0). Check every SPEC state and action has a non-fixme test (P1). Check the diff stays within the WP `files` globs (P2 unless it changes another WP's surface — then P1). Verify each finding against source with file:line before reporting. Output an actionable list grouped P0/P1/P2, then a verdict: SAFE-TO-MERGE or REWORK.

Implementer verifies findings against source, fixes confirmed P0/P1 issues, and re-requests review. Zero open P0/P1 plus passing required gates permits `done`. Sync the ignored graph locally. Publish only reviewed changes; do not include unrelated work or earlier unvalidated commits in a push.

## 6. When you are the architect

- New scope → new WP in the registry (never inline). Size XL → split before `ready`.
- Pending design but must proceed → write `agents/design/ahead/<ID>/SPEC.md` (template in `agents/design/99-RETURN-FORMAT-SPEC.md` §2) and set `designAhead: true`. When the real SPEC lands, diff and reconcile.
- Every decision → ED (product/UI behavior) or ADR (architecture). Supersede, never edit history.
- Phase gates per `00-PROGRAM-CHARTER.md` §4; announce in the dashboard by updating statuses.

## 7. Quick reference

| Need | Command |
|---|---|
| What implements route X | `pnpm codegraph:query -- route /admin/quotes` |
| Design → page/components/states/questions | `pnpm codegraph:query -- design AD-30` |
| Who depends on this file | `pnpm codegraph:query -- impact shared/contracts/quote.ts --depth 2` |
| Service surface | `pnpm codegraph:query -- service quote` |
| Component status | `pnpm codegraph:query -- component BulwarkDataTable` |
| Pages without tests / designs | `pnpm codegraph:query -- untested` · `-- undesigned` |
| Pending designs | `pnpm codegraph:query -- pending` |
| Open design questions (answers in ED register) | `pnpm codegraph:query -- questions AD-12` |
| Generate screen test skeleton | `pnpm screen:scaffold AD-12` |
| Render design baselines | `pnpm screen:baseline AD-12` |
| Gate a screen WP | `pnpm screen:audit WP-B2` |

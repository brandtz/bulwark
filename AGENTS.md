# AGENTS.md — Bulwark repository entry point for every coding agent

This file is read by Codex, Claude Code (via `CLAUDE.md`), GitHub Copilot (via
`.github/copilot-instructions.md`) and humans. It is short on purpose; it routes you.

## Start here, every session

1. `agents/program/00-PROGRAM-CHARTER.md` — rules of the rebuild program (non-negotiables, roles, gates).
2. `agents/program/04-AGENT-PLAYBOOK.md` — the exact procedure to claim, implement, test, and hand off a work package.
3. `pnpm codegraph:sync && pnpm codegraph:check` — hash-sync the local repository map and confirm the registry is consistent.
4. `agents/codegraph/work-packages.md` — what is startable now. Claim one package from `agents/program/work-packages.json`.

## Where things are

| Need | Location |
|---|---|
| What we are building and why (architecture verdicts, route map, data-model change list) | `agents/program/01-REARCHITECTURE-PLAN.md` |
| Binding product/UI decisions (ED-nnn) | `agents/program/ENGINEERING-DECISIONS.md` |
| Architecture decisions (ADR) | `agents/decisions/` |
| Design specs (source of truth for UI) | `agents/design/return/design-return/<Packet>/screens/<ID>-*/SPEC.md` + `desktop.html` etc.; component API: `…/A/components/SPEC.md`; tokens: `…/A/tokens/` |
| Design status (received vs pending) | `agents/design/return/INTAKE-REPORT.md`, `pnpm codegraph:query -- pending` |
| Screen inventory / IDs | `agents/design/01-SCREEN-INVENTORY.md` |
| How to test (adversarial standards, screen-contract suite) | `agents/program/03-TEST-STRATEGY.md` |
| Code conventions | `CONVENTIONS.md`, `CONTRACTS.md`, `UI-CONTRACTS.md` |
| Lessons learned | `agents/program/LESSONS.md` |
| Repository map / queries | `agents/codegraph/INDEX.md` (`pnpm codegraph:query -- --help`) |
| Running the app / DB / e2e | `docs/RUNNING.md` |

## Hard rules (violations are P0 in review)

- Contract-first (`shared/contracts` Zod) → mock → real → parity test. Both drivers green.
- `assertSameTenant(resolver, organizationId)` on every org-scoped service method.
- Integer cents for money. Labels via `useLabel()`. Status colors via `data-hue`.
- Stay inside your work package's `files` globs; one package `in-progress` per agent.
- Every acceptance bullet has a negative test. No `test.skip`/`fixme` left when requesting review.
- Run `pnpm codegraph:sync` after structural changes; generated `agents/codegraph/` is ignored, not committed. Use `pnpm codegraph:repair` for stale or damaged caches.
- `agents/design/` contains ignored local design exports. Obtain the approved extract before UI work; never infer design acceptance from the compact tracked `agents/program/design-index.json` catalog. Promote required runtime assets and test fixtures into tracked source directories.
- Do not touch `demo/` (ADR-0011).

## Commands

```
pnpm dev                      # Nuxt dev (real backend by default; needs DATABASE_URL in .env.local)
pnpm typecheck && pnpm lint && pnpm test:unit
$env:BULWARK_BACKEND='real'; pnpm test:e2e     # PowerShell; export in bash
pnpm test:screens             # screen-contract suite (opt-in project)
pnpm codegraph:sync              # no-op when source hashes are unchanged
pnpm codegraph:query -- <cmd>
pnpm codegraph:check              # strict CI-style check
pnpm codegraph:repair             # local self-heal, then strict check
pnpm screen:scaffold <ID> | screen:baseline <ID> | screen:audit <WP>
```

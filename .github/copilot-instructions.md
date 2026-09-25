# Copilot instructions — Bulwark

Read `AGENTS.md` at the repository root first; it routes to the program charter, the agent
playbook, the design specs, the engineering-decisions register and the CodeGraph.

Working rules (summary — full list in `AGENTS.md`):
- Work only inside a claimed work package from `agents/program/work-packages.json`; stay within its `files` globs.
- UI references are the approved local design SPECs and component specs under ignored `agents/design/`. Obtain the extract before UI work. Runtime assets and tests must use tracked source, never depend on ignored paths. The additive token migration preserves legacy RGB utilities until consumers migrate.
- Contract-first: `shared/contracts` (Zod) → `shared/mocks/*.mock.ts` → `server/services/*.real.ts` → parity test. `assertSameTenant` on every org-scoped method. Integer cents. `useLabel()` for copy. `data-hue` for status colors.
- Tests must include negatives (forbidden role → UI absent AND API 403; illegal transitions rejected server-side). Screen work needs `tests/e2e/screens/<ID>.spec.ts` with no `test.fixme` left (`pnpm screen:audit <WP>`).
- After structural changes run `pnpm codegraph:sync`; generated `agents/codegraph/` is ignored. Use `pnpm codegraph:repair` for local self-healing. Keep the compact canonical ID catalog in `agents/program/design-index.json` tracked; IDs alone do not prove design receipt.
- Prefer `pnpm codegraph:query -- route|design|impact|service|component|wp …` over grepping the tree.
- Decisions not already recorded go into `agents/program/ENGINEERING-DECISIONS.md` (ED) or `agents/decisions/` (ADR) before code depends on them.
- Do not modify `demo/` (ADR-0011).

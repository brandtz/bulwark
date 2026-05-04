# ADR-0003 — Frontend-first build order with mock service layer

## Status
Accepted — 2026-05-03

## Context
[BRD §11](../../docs/BULWARK_BRD.md) mandates frontend-first. The risk: build
beautiful UI the backend can't populate.

## Decision
Build the UI against a `MockService` layer that satisfies the **same Zod
contracts** the eventual backend will satisfy. The contracts live at
`shared/contracts/` and are imported by both UI and backend code. UI imports a
`useService('property')` composable that resolves to mock through E10 and to
real from E11 onward, gated by an env var.

## Consequences
- Contracts are written first (E0).
- Mock fixtures are realistic enough that screens look populated to the sponsor.
- Backend wiring (E11) is mechanical: implement `RealXService` with the same
  contract, flip the env var, re-run Playwright.

## Alternatives considered
- **Inline stub data per component** — rejected: untestable, drifts, leaves
  orphaned fixtures everywhere.
- **OpenAPI spec + codegen** — rejected for v1: too much ceremony for a small
  team. Revisit at Phase 2 if external consumers appear.
- **Backend-first** — rejected: contradicts BRD; produces invisible progress
  for the sponsor.

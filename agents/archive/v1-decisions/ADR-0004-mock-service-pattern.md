# ADR-0004 — Mock vs Real service split behind one composable

## Status
Accepted — 2026-05-03

## Context
ADR-0003 mandates a mock layer. We need a clean way to swap mock → real per
domain without rewriting UI code.

## Decision
Each domain exposes:
- `IXService` — TypeScript interface in `shared/contracts/services.ts`
- `MockXService` — implements the interface, lives in `shared/mocks/`
- `RealXService` — implements the interface, lives in `server/services/`

The UI never imports a service class directly. It calls
`const svc = useService('property')`, which is a Nuxt plugin that returns the
mock or real implementation based on `BULWARK_BACKEND` env var.

Per-method swap is allowed for partial migration — the factory can return a
mock for `list()` and a real for `create()` if needed during E11.

## Consequences
- Single chokepoint for mock-vs-real switching.
- E2E specs run identically against both backends — drift is a CI failure.
- Slightly more boilerplate than a "just use the real thing in dev" approach.

## Alternatives considered
- **MSW (Mock Service Worker)** — rejected: works at HTTP layer, but our
  contracts are also consumed by the *server* (validation), not just the
  client. A type-level interface gives both.
- **Two parallel apps (mock-app + real-app)** — rejected: doubles maintenance.

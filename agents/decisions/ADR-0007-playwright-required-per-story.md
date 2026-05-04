# ADR-0007 — Playwright test required per UI-affecting story

## Status
Accepted — 2026-05-03

## Context
Sponsor explicit requirement: every UI change ships with a Playwright spec so
regressions are caught immediately. Without this, agent-authored UI slides
silently.

## Decision
Every story whose code touches `app/` must include a `tests/e2e/<scope>.spec.ts`
file covering:
- Happy path (one full user journey through the new UI)
- At least one negative (e.g. wrong role gets 403, missing required field
  shows validation error)

CI runs Playwright on every PR. A failing spec blocks merge.

The spec file lives next to the story in the PR diff — story is not "done"
until spec is green.

## Consequences
- Test count grows linearly with feature count.
- Test runtime grows; we'll need parallelization (Playwright supports it
  natively) and possibly sharding by E11.
- New devs/agents have a worked example for every screen.

## Alternatives considered
- **Snapshot-only tests** — rejected: doesn't catch interaction regressions.
- **Manual QA per merge** — rejected: doesn't scale, doesn't survive
  agent-driven velocity.
- **E2E only at end of epic** — rejected: regressions accumulate; harder to
  diagnose later.

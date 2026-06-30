# ADR-0010 — Each story must be independently shippable

## Status
Accepted — 2026-05-03

## Context
Sponsor needs to diagnose progress per merge, not per epic. Long-lived
feature branches hide regressions and produce unreviewable mega-diffs.

## Decision
Every story produces a **working, observable UI delta** on its own. A story
may not depend on the *next* story's code to render. If a story produces a
broken or unusable screen, the story was scoped wrong — split it.

Concretely:
- A story can ship a placeholder/empty-state for downstream functionality
  (e.g. E3-S5's detail-hub tabs render `<EmptyState>` for tabs that haven't
  shipped yet).
- A story may not be marked complete with a TODO, FIXME, or `throw new Error('not implemented')`
  in a code path the user can hit.
- Stories merge to `main`. Long-lived feature branches are forbidden.

## Consequences
- More disciplined slicing required at story-write time.
- `main` is always demoable.
- Rollback granularity = story.

## Alternatives considered
- **Feature branches per epic** — rejected: invites mega-merges and
  regressions.
- **Allow incomplete merges behind feature flags** — partially accepted: flags
  are allowed for tenant-facing features (E9-S configures them), but not as a
  way to merge broken UI to `main`.

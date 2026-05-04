# ADR-0008 — Rich rationale comments on every non-trivial file

## Status
Accepted — 2026-05-03

## Context
Sponsor explicit requirement: code is agent-written but human-maintained. Agents
produce confident-looking code even when wrong; rich natural-language comments
are the only way a human reviewer (or a future agent) can audit *why* the code
looks the way it does.

## Decision
Every non-trivial file (>40 LOC) starts with a comment block of this shape:

```ts
/**
 * <FileName> — <one-sentence purpose>
 *
 * What this file does:
 *   - <bullet>
 *   - <bullet>
 *
 * Decisions captured here (link ADRs):
 *   - <ADR-XXXX>: why we did X this way
 *
 * Decisions NOT taken (and why):
 *   - We considered Y but rejected it because <reason>
 *   - We could optimize Z but defer it to <future epic / story>
 *
 * Maintenance notes:
 *   - When changing <X>, also update <Y>
 */
```

Every exported function with non-obvious behavior gets a docblock with the
same shape (purpose / decisions / decisions-not-taken).

CI lint rule (custom): files >40 LOC without a top-of-file comment block fail
the build.

## Consequences
- Slower per-file authoring — accepted.
- Easier diff review.
- Comments must be kept current; a stale ADR reference is a review defect.

## Alternatives considered
- **Standard JSDoc** — rejected: too thin; doesn't capture rejected alternatives.
- **Comments only on "tricky" files** — rejected: definition of "tricky" drifts;
  by-LOC threshold is enforceable.

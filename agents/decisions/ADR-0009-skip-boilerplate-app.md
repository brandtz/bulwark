# ADR-0009 — Adopt boilerplate process, not its app code

## Status
Accepted — 2026-05-03

## Context
[`boilerplate/`](../../boilerplate/) is a vendored snapshot of the
"agentic SaaS team factory" pattern. Its `dashboard/` folder is a Next.js 15
project manager. Our production stack (ADR-0001) is Nuxt 3 — different framework.

## Decision
- **Do not** fork `boilerplate/dashboard/` into the real app. Wrong stack;
  forking would either drag Next.js into a Nuxt project or require a port that
  buys nothing.
- **Do** adopt the boilerplate's stack-agnostic governance artifacts:
  - [epic-template.md](../../boilerplate/agents/templates/epic-template.md)
  - [story-template.md](../../boilerplate/agents/templates/story-template.md)
  - [adr-template.md](../../boilerplate/agents/templates/adr-template.md)
  - [handoff-template.md](../../boilerplate/agents/templates/handoff-template.md)
  - [coding-documentation-testing-standard.md](../../boilerplate/agents/standards/coding-documentation-testing-standard.md)
  - [handoff-standard.md](../../boilerplate/agents/standards/handoff-standard.md)
  - [review-signoff-standard.md](../../boilerplate/agents/standards/review-signoff-standard.md)

Project tracking is managed via three top-level files in this repo:
[BUILD_PLAN.md](../../BUILD_PLAN.md), [BUILD_STATUS.md](../../BUILD_STATUS.md),
and `agents/handoffs/`.

## Consequences
- No external PM tool needed for MVP.
- We benefit from boilerplate process discipline without framework lock-in.
- If the boilerplate dashboard later ports to Nuxt, revisit this ADR.

## Alternatives considered
- **Adopt the Next.js dashboard alongside Nuxt** — rejected: maintains two
  frameworks for one repo's worth of value.
- **Ignore boilerplate entirely** — rejected: throws away genuinely useful
  templates and standards.

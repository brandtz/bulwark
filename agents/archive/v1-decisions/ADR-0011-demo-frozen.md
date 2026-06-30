# ADR-0011 — Demo folder frozen; product code lives at repo root

## Status
Accepted — 2026-05-03

## Context
[`demo/`](../../demo/) is a working investor demo deployed via Netlify. It is
also a useful visual reference for the production build. Two paths exist:
(a) replace it in place with the real Nuxt app, or (b) freeze it and build the
real app alongside it.

## Decision
Freeze the demo. The production Nuxt 3 app lives at the repo root
(`app/`, `server/`, `shared/`, `tests/`). The demo continues to deploy from
[`netlify.toml`](../../netlify.toml) `publish = "demo"` and serves the investor
audience.

The real app deploys to Vercel (per TECH §11), to a separate domain.

## Consequences
- Two artifacts, two deploy targets, one repo.
- Demo never breaks because product code never touches it.
- When the real app surpasses the demo's polish, we may decide to retire the
  demo — that's a future ADR.
- Sponsor explicitly confirmed this in the prompt that initiated this plan.

## Alternatives considered
- **Replace demo in place** — rejected: loses the investor asset and conflates
  audiences.
- **Move demo to a separate repo** — deferred: not worth the split right now;
  revisit if the real app's repo size becomes painful for CI.

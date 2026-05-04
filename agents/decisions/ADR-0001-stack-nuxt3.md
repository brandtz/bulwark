# ADR-0001 — Confirm Nuxt 3 + Drizzle + Neon stack

## Status
Accepted — 2026-05-03

## Context
[`docs/BULWARK_TECH.md`](../../docs/BULWARK_TECH.md) §1 specifies the stack. The
demo at [`demo/`](../../demo/) is static HTML with no framework, and the
boilerplate at [`boilerplate/dashboard/`](../../boilerplate/dashboard/) is
Next.js 15. We need to confirm which one becomes the production app.

## Decision
Build the production app on **Nuxt 3 + TypeScript strict + Tailwind v3 + Drizzle
ORM + Neon serverless Postgres + Pinia + JOSE + nuxt-auth-utils + Playwright +
Vitest**, exactly as TECH §1 specifies. Source lives at the repo root.

## Consequences
- Demo and boilerplate dashboard stay as separate artifacts — neither becomes
  the production code.
- Server code uses Nitro (Nuxt 3's server engine) — no separate API service.
- All TypeScript, no JavaScript.

## Alternatives considered
- **Next.js 15 (matching boilerplate)** — rejected: violates the locked TECH
  spec, would orphan the BRD's Nitro-specific rationale (file-based API, edge
  preset, Vercel deployment via Nuxt preset).
- **Remix / SvelteKit** — not considered; would re-open the stack debate without
  benefit.

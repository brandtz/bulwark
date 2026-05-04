# Bulwark — Build Status

> **Live cursor.** Updated by every agent at the end of every session.
> Read this file before doing anything.

---

## Current Phase

**Phase 0 — Spec & Scaffold**

## Active Epic

[E0 — Spec & Scaffold](agents/epics/E00-spec-and-scaffold.md)

## Active Story

_Between stories_ — half of E0 is done; rest (E0-S4 / S5 / S6) lands in next session.

## Recent Completions

| Date | Story | Notes |
|---|---|---|
| 2026-05-03 | (planning) | BUILD_PLAN.md, all 14 epic files, 11 ADRs, BUILD_STATUS.md created. Demo frozen. |
| 2026-05-03 | E0-S1 | CONTRACTS.md + UI-CONTRACTS.md skeletons + CONVENTIONS root pointer landed. |
| 2026-05-03 | E0-S2 | Nuxt 3 scaffold at repo root: package.json, nuxt.config.ts, tsconfig.json, app/app.vue, app/pages/index.vue, .env.example. Verified booting on http://localhost:3000 (HTTP 200, wordmark + portal cards render). |
| 2026-05-03 | E0-S3 | tailwind.config.ts + app/assets/css/tokens.css + app/assets/css/main.css aligned to BULWARK_STYLE_GUIDE §2–§4. |
| 2026-05-03 | E0-S7 | playwright.config.ts (3 device projects), vitest.config.ts, drizzle.config.ts, tests/e2e/smoke.spec.ts. |
| 2026-05-03 | E0-S8 | .github/workflows/ci.yml — typecheck/lint/unit + Playwright with browser install. |

## Next Up

1. **Commit + push** the planning artifacts and scaffold to `origin/main`.
2. E0-S4 — Drizzle schemas (`server/db/schema/*`).
3. E0-S5 — Zod contracts (`shared/contracts/*.ts`) — full per-domain.
4. E0-S6 — `MockServiceFactory` + per-domain mocks with realistic fixtures.
5. E1-S1 — Single AppLayout (sidebar + topbar + bottom nav) consuming `nav.config.ts`.

## Verified locally

- `pnpm install` clean (Nuxt 3.21.4, Nitro 2.13.4, Vite 7.3.2, Vue 3.5.33, Tailwind 3).
- `pnpm exec nuxt prepare` generates `.nuxt/tsconfig.json`.
- `pnpm dev` serves http://localhost:3000 — `Bulwark` wordmark + four portal cards render.

## Known follow-ups (defects to fix in next session)

- `pnpm typecheck` script needs `vue-tsc` installed; will add in E0-S5.
- Custom ESLint rules per ADR-0005 / ADR-0008 (banned hex outside tokens.css, banned `<aside>` outside nav, top-of-file comment block enforcement) — bootstrap rule files in E0-S5/S6 follow-up.
- `pnpm-lock.yaml` must be committed for CI's `--frozen-lockfile`.

## Blockers

_None._

## Open Questions for Sponsor

_None._

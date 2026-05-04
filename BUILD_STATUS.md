# Bulwark — Build Status

> **Live cursor.** Updated by every agent at the end of every session.
> Read this file before doing anything.

---

## Current Phase

**Phase 1 — App Shell & Design System**

## Active Epic

[E1 — App Shell & Design System](agents/epics/E01-app-shell-and-design-system.md)

## Active Story

E1-S2 — remaining UI primitives per `UI-CONTRACTS.md` (Input, Textarea, Select, MultiSelect, Toggle, PassFailToggle, DatePicker, SegmentedControl, SearchField, FilePicker, KpiCard, JobCard, Avatar, EmptyState, Skeleton, Pagination, Breadcrumbs, Modal, Drawer, Tabs, Stepper, Toast).

## Recent Completions

| Date | Story | Notes |
|---|---|---|
| 2026-05-03 | (planning) | BUILD_PLAN.md, all 14 epic files, 11 ADRs, BUILD_STATUS.md created. Demo frozen. |
| 2026-05-03 | E0-S1 | CONTRACTS.md + UI-CONTRACTS.md skeletons + CONVENTIONS root pointer landed. |
| 2026-05-03 | E0-S2 | Nuxt 3 scaffold at repo root. Verified booting on http://localhost:3000. |
| 2026-05-03 | E0-S3 | tailwind.config.ts + tokens.css + main.css aligned to BULWARK_STYLE_GUIDE §2–§4. |
| 2026-05-03 | E0-S7 | playwright.config.ts (3 device projects), vitest.config.ts, drizzle.config.ts. |
| 2026-05-03 | E0-S8 | .github/workflows/ci.yml — typecheck/lint/unit + Playwright. |
| 2026-05-04 | E0-S4 | Drizzle schemas: organizations, users (+ roleEnum), memberships, clients, properties (+ propertyStatusEnum 13 values). Remaining domain tables land just-in-time per epic. |
| 2026-05-04 | E0-S5 | Zod contracts: `_shared`, `auth`, `property`, `client`, `services` barrel — service interfaces are the single source of truth between mock + real impls. |
| 2026-05-04 | E0-S6 | Mock services + factory + Nuxt plugin + composables: `useService('property')`, `useSession()`. Defaults to FIXTURE_USER_ADMIN signed in for dev DX (real auth lands E2-S1). 13 property fixtures (one per status), 5 clients, 3 users. |
| 2026-05-04 | E1-S1 | Single AppLayout (sidebar + topbar + bottom nav). `nav.config.ts` is the only nav source. ADR-0005 enforced: only `default.vue` renders nav. nuxt.config `components: { pathPrefix: false }` so nested folders don't prefix names. Admin dashboard placeholder + role-aware index redirect. **10 Playwright tests passing** across Chromium/Mobile Safari/Pixel (4 nav-shell desktop+mobile tests, 6 smoke tests). 3 UI primitives shipped: BulwarkButton, BulwarkCard, StatusBadge. |

## Next Up

1. **E1-S2** — remaining UI primitives (one Playwright spec per primitive per ADR-0007).
2. E1-S3 — Toast/notification system (`useToast()` composable + `<BulwarkToastHost />` mounted in `default.vue`).
3. E1-S4 — Modal + Drawer (focus-trap, Escape, backdrop click).
4. E1-S5 — Form primitives wrap-up (validation messaging, error states).
5. E2-S1 — `/login` real form + middleware (replaces always-signed-in mock default).

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

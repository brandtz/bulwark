# Bulwark — Build Status

> **Live cursor.** Updated by every agent at the end of every session.
> Read this file before doing anything.

---

## Current Phase

**Phase 1 — App Shell & Design System**

## Active Epic

[E1 — App Shell & Design System](agents/epics/E01-app-shell-and-design-system.md)

## Active Story

E2-S3 — role-based middleware + 403 page.

E2-S2 closed: forgot/reset password and accept-invite flows with stateless base64url tokens (kind + exp). Reset bounces to /login?reset=ok for fresh sign-in; accept-invite does a hard navigation into /admin/dashboard. Mock `lookup()` synthesizes a SessionUser for cookie-known emails so SSR + browser stay in sync across hard navs. **23 Playwright tests passing** in chromium project (1 skipped).

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
| 2026-05-04 | E1-S2 + E1-S3 + E1-S4 + E1-S5 (combined) | 22 UI primitives shipped: Input, Textarea, Select, MultiSelect, Toggle, PassFailToggle, DatePicker, SegmentedControl, SearchField, FilePicker, KpiCard, JobCard, Avatar, EmptyState, Skeleton, Pagination, Breadcrumbs, Modal, Drawer, Tabs, Stepper, ToastHost. `useToast()` composable + `<BulwarkToastHost />` mounted in default layout. `/dev/ui` playground page. Tailwind tokens extended (status.{success,warning,error,info}, surface.muted, primary.700, height.input, borderRadius.input, spacing.bottom-nav/topbar). Fixed AppBottomNav inline `display:grid` defeating `md:hidden`. **19 Playwright tests passing** (smoke + nav-shell + 9 ui-primitives spec running serial). |
| 2026-05-04 | E2-S1 | Cookie-backed MockAuthService (replaces broken module-level state — SSR + client now share session via `bulwark.mock.persona` cookie). New `useAuth()` composable (login/logout/loading/error). `/login` page with form + dev persona quick-pick. `auth.global.ts` middleware redirects unauthed traffic to `/login?next=...` with status 302. AppTopBar gains inline Sign Out (full UserMenu in E2-S5). Test helpers `signIn` / `signInAsAdmin` / `signOut` added; existing specs updated to seed admin cookie in beforeEach. **23 Playwright tests passing**. |
| 2026-05-04 | E2-S2 | Forgot/reset password + accept-invite (stateless base64url tokens with kind + exp; trivial to verify). New pages `/forgot-password`, `/reset-password`, `/accept-invite` (all `layout: false`). `useAuth` extended with `requestPasswordReset` / `resetPassword` / `previewInvite` / `acceptInvite`. Reset path forces fresh sign-in (logout + bounce to `/login?reset=ok`) — matches future real backend session-revoke. Accept-invite does a hard navigation into `/admin/dashboard` to sidestep a Nuxt 3.21 SPA-vs-`layout: false` transition race. Mock `lookup()` now synthesizes a SessionUser when the cookie email isn't yet in `userByEmail` (mirrors how a real backend trusts a signed session cookie). **23 chromium tests passing** + 6 new auth-recovery tests. |

## Next Up

1. **E2-S3** — role-based middleware + 403 page.
2. E2-S4 — org switcher (super_admin + multi-org users).
3. E2-S5 — full UserMenu dropdown (replaces inline Sign Out).
4. E2-S6 — tenant firewall in MockServiceFactory.
5. E2-S7 — Playwright persona matrix.
6. E3-S1 — Properties pipeline list view.

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

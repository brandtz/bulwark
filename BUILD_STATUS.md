# Bulwark — Build Status

> **Live cursor.** Updated by every agent at the end of every session.
> Read this file before doing anything.

---

## Current Phase

**Phase 1 — App Shell & Design System**

## Active Epic

[E1 — App Shell & Design System](agents/epics/E01-app-shell-and-design-system.md)

## Active Story

E2-S5 — full UserMenu dropdown (replaces inline Sign Out).

E2-S4 closed: super_admin fixture (sasha@bulwark.platform) with two memberships, second org `Acme Restoration LLC`. Active-org override persisted via `bulwark.mock.activeOrg` cookie. `useAuth.switchActiveOrg`. Dedicated `/org-switcher` page + topbar widget upgraded (NuxtLink for multi-org users, static chip for singleton). **30 chromium tests passing** (1 skipped).

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
| 2026-05-04 | E2-S3 | Role-based middleware + `/403` page. New `usePermissions` composable exports role-group constants (`ROLE_GROUPS.admin`, `.field`, `.sub`, etc.) plus `hasAnyRole` / `isAdmin` / `isField` / `isSub` / `isSuperAdmin`. New named middleware `app/middleware/role.ts` reads `definePageMeta({ requiredRoles })` and bounces non-matches to `/403` (302). `/403` page is styled (layout-less, calls `ensureLoaded` itself since auth.global skips public routes), shows the user's actual role and offers a role-aware "Go to my dashboard" button + Back. `/admin/dashboard` and `/admin/properties` opted in. **28 chromium tests passing** (1 skipped) including 5 new role-guard tests; auth-spec adjusted to use admin persona for `?next=/admin/properties`. |
| 2026-05-04 | E2-S4 | Org switcher. New super_admin fixture (`sasha@bulwark.platform`) with memberships in Bulwark Demo Co. + Acme Restoration LLC. Active-org override persisted via second cookie `bulwark.mock.activeOrg`. `MockAuthService.currentUser` applies the override (and falls back gracefully if it points to a revoked membership); `switchActiveOrg` validates membership and writes the cookie; `login` / `logout` clear the override. New `/org-switcher` page + topbar widget upgraded to a NuxtLink for multi-org users (static chip for singletons). `useAuth.switchActiveOrg`. **30 chromium tests passing** (1 skipped) including 2 new org-switcher tests. |

## Next Up

1. **E2-S5** — full UserMenu dropdown (replaces inline Sign Out).
2. E2-S6 — tenant firewall in MockServiceFactory.
3. E2-S7 — Playwright persona matrix.
4. E3-S1 — Properties pipeline list view.

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

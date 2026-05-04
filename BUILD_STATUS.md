# Bulwark — Build Status

> **Live cursor.** Updated by every agent at the end of every session.
> Read this file before doing anything.

---

## Current Phase

**Phase 1 — App Shell & Design System**

## Active Epic

[E1 — App Shell & Design System](agents/epics/E01-app-shell-and-design-system.md)

## Active Story

E3-S5 — Property detail hub with tabs (Overview, Assessment, Quotes, Work Orders, Compliance, Invoices, Photos, Notes).

E3-S4 closed: property intake form at `/admin/properties/new` with Zod validation. New `app/pages/admin/properties/new.vue` (form moved into `properties/index.vue` so the folder can host `new.vue`). Validation runs against `PropertyCreateInputSchema.omit({ organizationId: true })` — `organizationId` is injected from `useSession()` and isn't user-controlled (the fixture orgId is intentionally non-RFC-4122 for readability). On success: `property.create()` then `refreshNuxtData("properties-${orgId}")` then `router.push("/admin/properties")` so the new card appears immediately. New `tests/e2e/property-intake.spec.ts` (3 tests). Cold-start race fixes: added `waitForLoadState('networkidle')` after `goto()` for `auth.spec.ts` persona quick-pick, both list-toggle tests, and the intake submit tests. **59 chromium tests passing** (2 skipped) + 6 unit tests.

## Recent Completions

| Date | Story | Notes |
|---|---|---|
| 2026-05-04 | E3-S4 | Property intake form. New `app/pages/admin/properties/new.vue` (the kanban moved into `properties/index.vue` so the folder can host the new route). Form uses `BulwarkInput` / `BulwarkSelect` / `BulwarkTextarea`; validates with `PropertyCreateInputSchema.omit({ organizationId: true })` (org id is injected from session, not user-controlled — fixture orgIds are intentionally non-RFC-4122). On success: `property.create()` → `refreshNuxtData('properties-${orgId}')` → `router.push('/admin/properties')`. New `tests/e2e/property-intake.spec.ts` (3 tests — render, empty-form validation, valid submission lands on pipeline). Cold-start fixes: added `waitForLoadState('networkidle')` to auth persona quick-pick, both list-toggle tests, and the intake submit tests. **E3-S3 deferred** (drag-drop is risky; will return after E3-S5/S6). **59 chromium tests passing** (2 skipped) + 6 unit tests. |
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
| 2026-05-04 | E3-S2 | Pipeline list view (mobile) + FT-12 segmented kanban/list toggle. New `PipelineList.vue` renders status-grouped flat list with sticky section headers; empty sections are omitted (the kanban already shows the full status set). `useState('properties.view')` persists the choice across nav; `onMounted` flips narrow viewports (`< 768px`) to list. New `tests/e2e/properties-pipeline-list.spec.ts` (4 tests). **56 chromium tests passing** (2 skipped) + 6 unit tests. |
| 2026-05-04 | E3-S1 | Properties pipeline kanban (desktop) at `/admin/properties`. New `PipelineColumn` + `PropertyCard` components under `app/components/property/`. Server-rendered via `useAsyncData` (pageSize 100), grouped client-side by status, all 13 columns rendered in fixed left-to-right UX order with empty-state line for empty columns. Header shows total + `New property` deep-link CTA. New `tests/e2e/properties-pipeline.spec.ts` (5 tests — column count, populated statuses, empty status, deep-link href, CTA visible). **53 chromium tests passing** (1 skipped) + 6 unit tests. |
| 2026-05-04 | E2-S8 | Persona × route matrix. New `tests/e2e/persona-matrix.spec.ts` data-driven over a `CASES` table covering `(persona, route)` → `{allow, forbid, redirect-login}`. 10 cases: {admin, super_admin, field, sub, anonymous} × {`/admin/dashboard`, `/admin/properties`}. Adding a new protected route is a one-line table edit. Epic **E2 complete**. **48 chromium tests passing** (1 skipped) + 6 unit tests. |
| 2026-05-04 | E2-S7 | Tenant firewall in MockServiceFactory. New `shared/mocks/tenant.ts` (`TenantContext`, `TenantResolver`, `TenantViolationError`, `assertSameTenant`). `MockPropertyService` + `MockClientService` constructors accept an optional resolver and call `assertSameTenant(this.tenantResolver, organizationId)` at the top of every method — cross-tenant requests throw before any data access. Factory wires the default resolver via new `MockAuthService.resolveTenantSync()` so the singleton mock services pick up the active-org override per-request. New `tests/unit/tenant-firewall.test.ts` (6 tests) covers: cross-tenant property.list/get throws, cross-tenant client.list throws, same-tenant succeeds, missing resolver short-circuits, null resolver short-circuits. **38 chromium tests passing** (1 skipped) + **6 unit tests**. |
| 2026-05-04 | E2-S6 | Styled 404 / 500 error pages. New `app/error.vue` branches on `error.statusCode`: 404 card (`data-testid="not-found-card"`) and generic server-error card (`data-testid="server-error-card"`), both with `home-button` + `back-button`. Home calls `clearError({ redirect: '/' })`; Back uses `window.history.length > 1` then `router.back()` after `clearError()`, else falls through to home. New `/dev/throw` page (public per `auth.global` `/^\/dev(\/\|$)/`) deliberately throws a 500 for the spec. Removed `@pinia/nuxt` from `nuxt.config.ts` modules and uninstalled `pinia` / `@pinia/nuxt` — its payload plugin's `shouldHydrate` calls `obj.hasOwnProperty(skipHydrateSymbol)` on null-prototype objects in the `NuxtError` payload and throws, masking every 4xx as a 500. No stores in the app yet — re-enable when needed. New `tests/e2e/error-pages.spec.ts` (3 tests). **38 chromium tests passing** (1 skipped). |
| 2026-05-04 | E2-S5 | UserMenu dropdown. New `app/components/nav/UserMenu.vue` (`data-testid` `user-menu-button`, `user-menu-panel`, `user-menu-switch-org`, `logout-button`) replaces the inline Sign Out chip in `AppTopBar`. Click-to-toggle, Escape closes, `mousedown` listener attached only while the menu is open and removed on close. `Switch organization` link only renders for multi-membership users. Existing tests that asserted the bare `logout-button` updated to assert `user-menu-button` (or to first open the dropdown). New `tests/e2e/user-menu.spec.ts` with 5 tests. **35 chromium tests passing** (1 skipped). |

## Next Up

1. **E3-S5** — Property detail hub with tabs (Overview populated, others render `EmptyState` placeholders).
2. E3-S6 — Client detail page (`/admin/clients/[id]`).
3. E3-S3 — Drag-drop status change (deferred from E3 — risky, return after S5/S6).
4. E3-S7 — Full happy-path Playwright (login → intake → pipeline → detail).

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

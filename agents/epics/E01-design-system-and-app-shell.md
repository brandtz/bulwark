# Epic E1 — Design System & Persistent App Shell

> **Phase**: 1 | **Build order**: 2nd | **Depends on**: E0
>
> This epic exists *because* of the inconsistencies in the demo. By the end of
> it, every authenticated page renders inside one `AppLayout` component and the
> nav is impossible to lose, recolor, or omit by accident.

## Objective

Ship a complete UI primitive library and a single `AppLayout` that owns the
sidebar (desktop), bottom nav (mobile), top bar, breadcrumbs, toast region,
and a permission-gated nav whose contents come from one declarative file.

## User / Business Value

- Sponsor can navigate any role's portal and see consistent chrome.
- Future epics build screens by dropping a `<page>` into `app/pages/` — they
  inherit nav for free. Impossible to ship a screen that "loses" the sidebar.
- Color scheme drift (light vs dark sidebar) gets eliminated structurally.

## In Scope

- `app/layouts/default.vue` — the AppShell. Owns sidebar + bottom nav + top bar.
- `app/layouts/auth.vue` — borderless layout for login / forgot-password.
- `app/layouts/public.vue` — for homeowner-facing public pages (E13).
- `shared/nav/nav.config.ts` — declarative nav per role (super_admin, org_admin, org_manager, field, sub_contractor, homeowner). One source of truth.
- `app/composables/usePermissions.ts` — gates rendering of nav items + page-level guards.
- `app/components/ui/` — Button, Input, Textarea, Select, MultiSelect, DatePicker, TimePicker, Toggle, SegmentedControl, SearchField, Checkbox, RadioGroup, Tabs, Modal, Drawer, Toast, Card, KpiCard, JobCard, StatusBadge, Avatar, EmptyState, Spinner, Skeleton, Pagination, Breadcrumbs, FilePicker, Stepper.
- `app/components/nav/` — Sidebar, BottomNav, TopBar, OrgSwitcher, RolePill (dev only).
- `/_components` debug page enumerating every UI primitive — sponsor walkthrough surface.
- Storybook-equivalent: a single `pages/_components.vue` that renders every component in every state.

## Out of Scope

- Any actual feature screen (those start in E3).
- Auth wiring — `usePermissions` reads a stub `useAuth().role` until E2.

## Dependencies

E0 (tokens, Tailwind, Nuxt project must exist).

## Risks

- **Nav config gets mutated outside `nav.config.ts`** → CI lint rule banning sidebar/bottom-nav imports outside `app/components/nav/`.
- **Components diverge from tokens** → ESLint rule banning hex colors outside `tokens.css`; require Tailwind classes only.

## Stories

| ID | Title | Visible delta |
|---|---|---|
| E1-S1 | `AppLayout` skeleton — sidebar, top bar, bottom nav, slot | every route shows the chrome |
| E1-S2 | `nav.config.ts` declarative nav + `<NavRenderer>` | sidebar populates from config |
| E1-S3 | `usePermissions` + role-gated nav rendering | switching role hides/shows items |
| E1-S4 | Base form primitives (Button, Input, Select, Textarea, Toggle, DatePicker, FilePicker) | `/_components` page renders them |
| E1-S5 | Display primitives (Card, KpiCard, JobCard, StatusBadge, Avatar, EmptyState, Skeleton, Pagination, Breadcrumbs) | `/_components` page renders them |
| E1-S6 | Overlay primitives (Modal, Drawer, Toast, Tabs, Stepper) | `/_components` page renders them |
| E1-S7 | Mobile bottom nav + responsive sidebar collapse | resize browser, sidebar collapses to icons; <768px swaps to bottom nav |
| E1-S8 | Top bar (org switcher + user menu + breadcrumbs + global search slot) | rendered on every authenticated page |
| E1-S9 | **Playwright nav matrix** — for each role, asserts each route renders, sidebar present, bottom nav present at mobile width, blocked routes 403 | green spec |

## Review Notes

_TBD._

## Approval Status

Proposed.

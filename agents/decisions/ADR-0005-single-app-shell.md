# ADR-0005 — Single AppLayout owns all persistent navigation

## Status
Accepted — 2026-05-03

## Context
The demo at [`demo/`](../../demo/) suffered visible inconsistencies: the
sidebar was present on some admin pages and missing on others; the sidebar's
color flipped between dark and light depending on which wireframe was injected.
Sponsor flagged this as the first thing to fix in the real build.

Root cause: every page in the demo declared its own `<aside>` HTML, so any page
that forgot to do so (or did so differently) broke consistency.

## Decision
The real app uses **exactly one** authenticated layout — `app/layouts/default.vue`
— that owns:
- Desktop sidebar (always dark, always 240px)
- Mobile bottom nav (always visible <768px)
- Top bar (org switcher + user menu + breadcrumbs)
- Toast region

Pages render via `<slot />`. Pages **may not** declare their own sidebar or
top-level navigation. A CI lint rule bans `<aside>` and `<nav class*="sidebar">`
outside `app/components/nav/`.

Nav contents come from `shared/nav/nav.config.ts` — a declarative list of
items per role. Adding a new screen = adding a row to this file. Hiding a
screen for a role = removing it from that role's array.

## Consequences
- Impossible to ship a screen with the wrong nav.
- Nav additions are reviewed in one place.
- Per-page custom chrome (e.g. fullscreen photo viewer) requires opting into
  a different layout (`auth.vue`, `public.vue`, `fullscreen.vue`).

## Alternatives considered
- **Per-page layouts with a "sidebar component" they can include** — rejected:
  exactly the demo's failure mode.
- **Slot-based composition where pages pass nav items up** — rejected:
  unnecessary indirection; nav.config.ts is simpler and audit-friendly.

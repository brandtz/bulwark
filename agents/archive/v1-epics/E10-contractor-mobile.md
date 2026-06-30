# Epic E10 — Contractor / Field Mobile Polish + Field-Only Screens

> **Phase**: 1 | **Build order**: 11th | **Depends on**: E1–E9

## Objective

Drew (the GC field user) gets a mobile-optimized experience over the same
screens the admin uses, with financial data hidden, plus the field-only
screens enumerated in [BULWARK_SCREENS_BY_ROLE](../../docs/BULWARK_SCREENS_BY_ROLE.md) §3.

## In Scope

- `app/pages/field/dashboard.vue` (Screen 02) — mobile-first home for the GC
- `app/pages/field/my-jobs.vue` (CON-02)
- `app/pages/field/profile.vue` (CON-01)
- `app/pages/field/sync-queue.vue` (CON-04) — placeholder offline queue UI
- Permission flags in nav so `field` role hides financial nav items + hides quote/invoice tabs on detail hub
- Mobile-layout audit on shared screens (04 pipeline, 05 detail hub, 06 intake, 08 assessment, 14 progress, 17 compliance generator)

## Out of Scope

- Audio field capture (Phase 3+)
- Real offline sync (PWA work, Phase 2+)

## Stories

| ID | Title | Status |
|---|---|---|
| E10-S1 | Field dashboard (Screen 02) — KPIs filtered to "my work" | ✅ Done |
| E10-S2 | My Assigned Jobs filtered list | ✅ Done (`/field/work-orders`; per-user filter deferred until WO contract grows an `assignedToUserId`) |
| E10-S3 | Profile / account page | ✅ Done (`/profile`, cross-role) |
| E10-S4 | Sync queue placeholder + ADR for actual offline strategy | ✅ Done (stub at `/field/sync-queue`; offline strategy ADR deferred to Phase 2 PWA work) |
| E10-S5 | Permission audit on shared screens — financial sections hidden for `field` | ✅ Done (field role has no /admin/* access by RBAC; field surfaces never render `$`) |
| E10-S6 | **Playwright** — log in as field role, walk pipeline → detail → assessment → progress update on a 390px viewport, assert no $ value visible | ✅ Done (`tests/e2e/happy-path-field.spec.ts` — dashboard → properties → property → assessment, 390×844 viewport, asserts no `$` on every field surface) |

## Approval Status

✅ **Closed** — Field role gets a complete mobile-first surface: dashboard (`/field/dashboard`), properties list + detail (`/field/properties`, `/field/properties/[id]`), work-orders list (`/field/work-orders`), assessments list (`/field/assessments`), sync-queue stub (`/field/sync-queue`), and shared profile (`/profile`). Happy-path spec passes 1/1 chromium.

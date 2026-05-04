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

| ID | Title |
|---|---|
| E10-S1 | Field dashboard (Screen 02) — KPIs filtered to "my work" |
| E10-S2 | My Assigned Jobs filtered list |
| E10-S3 | Profile / account page |
| E10-S4 | Sync queue placeholder + ADR for actual offline strategy |
| E10-S5 | Permission audit on shared screens — financial sections hidden for `field` |
| E10-S6 | **Playwright** — log in as field role, walk pipeline → detail → assessment → progress update on a 390px viewport, assert no $ value visible |

## Approval Status

Proposed.

# Epic E6 — Work Orders + Subcontractor Assignment

> **Phase**: 1 | **Build order**: 7th | **Depends on**: E5

## Objective

Convert accepted quotes into work orders, break each work order into trade
slots, assign subs per trade, track progress.

## In Scope

- `app/pages/work-orders/index.vue` — list with status filters (Screen 10)
- `app/pages/work-orders/[id].vue` — detail (Screen 16)
- `app/pages/properties/[id]/work-orders/new.vue` — create from quote
- `app/pages/subcontractors/index.vue` + `[id].vue` (Screens 17, 18)
- `app/components/workorder/JobProgressUpdater.vue` (Screen 14)
- `shared/contracts/work-order.ts`, `subcontractor.ts`
- Mock: `MockWorkOrderService`, `MockSubcontractorService`

## Out of Scope

- The subcontractor's own portal view (E12)

## Dependencies

E5 (quotes), E3 (properties), E1 (status badges, JobCard).

## Stories

| ID | Title | Visible delta |
|---|---|---|
| E6-S1 | WO detail page — trades table, schedule, materials list | renders mock WO |
| E6-S2 | Create WO from accepted quote | pre-fills trades from quote |
| E6-S3 | Sub assignment: pick a sub per trade from MockSubcontractorService | assignment persists |
| E6-S4 | Job progress updater component (used in WO detail and field views later) | status tick + photo placeholder |
| E6-S5 | Subcontractor list + detail screens | clickable, edit license info |
| E6-S6 | **Playwright** — accept quote → create WO → assign sub → mark trade in-progress | green spec |

## Approval Status

Proposed.

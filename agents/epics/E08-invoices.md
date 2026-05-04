# Epic E8 — Invoices

> **Phase**: 1 | **Build order**: 9th | **Depends on**: E7

## Objective

Invoice list + detail + manual mark-paid. Stripe deferred to Phase 2.

## In Scope

- `app/pages/invoices/index.vue` (Screen 21) — list w/ status + overdue filter
- `app/pages/invoices/[id].vue` (Screen 22) — detail, mark paid
- `app/pages/properties/[id]/invoices/new.vue` — create from completed WO
- `shared/contracts/invoice.ts` + `MockInvoiceService`

## Stories

| ID | Title | Visible delta |
|---|---|---|
| E8-S1 | Invoice list with overdue/paid/draft filters | sponsor sees populated list |
| E8-S2 | Invoice detail + line items | renders cleanly |
| E8-S3 | Create from WO + mark paid | status chip flips |
| E8-S4 | **Playwright** — create from WO → mark paid → see in paid filter | green spec |

## Approval Status

Proposed.

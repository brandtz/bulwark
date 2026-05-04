# Epic E5 — Quotes

> **Phase**: 1 | **Build order**: 6th | **Depends on**: E4

## Objective

Build the quote builder, preview, and list. Quotes hang off an assessment;
line items pull from the materials/labor catalogs (configured in E9, default
catalog seeded as fixture).

## In Scope

- `app/pages/properties/[id]/quotes/new.vue` — builder
- `app/pages/properties/[id]/quotes/[quoteId].vue` — preview / detail
- `app/pages/quotes/index.vue` — admin quote list
- `shared/contracts/quote.ts` + `MockQuoteService`
- Money helper `shared/utils/money.ts` — integer cents in, formatted strings out (per CONVENTIONS)
- Quote PDF preview — HTML-rendered for now (real PDF in E11)

## Out of Scope

- Real PDF generation (Puppeteer in E11)
- Stripe-backed payments (E8 / Phase 2)

## Dependencies

E4 (assessment generates upgrade list that pre-populates quote line items).

## Stories

| ID | Title | Visible delta |
|---|---|---|
| E5-S1 | Quote builder — line items, qty, unit cost, markup, tax | totals compute correctly |
| E5-S2 | Pre-populate from assessment recommended upgrades | "Start from assessment" button |
| E5-S3 | Quote preview HTML (matches PDF template) + Send (mock email) | sponsor sees a printable quote |
| E5-S4 | Quote list with status filters | sortable list |
| E5-S5 | **Playwright** — build quote from assessment → preview → mark sent → see in list | green spec |

## Approval Status

Proposed.

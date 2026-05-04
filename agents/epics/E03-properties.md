# Epic E3 — Property Pipeline + Intake + Detail Hub

> **Phase**: 1 | **Build order**: 4th | **Depends on**: E0, E1, E2
>
> The Property entity is the spine of the whole product. Every other domain hangs
> off `propertyId`. This epic makes the spine visible and editable.

## Objective

Stand up the three property surfaces: pipeline (kanban + list), intake form,
and detail hub. All backed by `MockPropertyService`.

## In Scope

- `app/pages/properties/index.vue` — pipeline kanban (desktop), list (mobile). Drag-drop status changes (using `vue-draggable`).
- `app/pages/properties/new.vue` — intake form (FT-01/02/07/09 from STYLE_GUIDE)
- `app/pages/properties/[id]/index.vue` — detail hub with tabs: Overview, Assessment, Quotes, Work Orders, Compliance, Invoices, Photos, Notes
- `app/pages/clients/[id].vue` — client/owner detail (Screen 07)
- `app/components/property/PipelineColumn.vue`, `PropertyCard.vue`
- `shared/mocks/fixtures/properties.ts` — 12+ realistic mock properties spanning all statuses
- Pinia store `stores/property.ts`

## Out of Scope

- Assessment form itself (E4)
- Quote builder, work orders, etc. (those tabs render `<EmptyState>` placeholders that link to their epic)

## Dependencies

E0 contracts (`property.contract.ts`), E1 nav + cards + status-badge + tabs, E2 auth.

## Risks

- Drag-drop on mobile is finicky → mobile uses long-press → action sheet to change status, not drag.

## Stories

| ID | Title | Visible delta |
|---|---|---|
| E3-S1 | Pipeline kanban (desktop) reading from MockPropertyService | sponsor sees populated columns |
| E3-S2 | Pipeline list (mobile) with FT-12 segmented toggle | mobile-width view |
| E3-S3 | Drag-drop status change (desktop) + long-press action sheet (mobile) | dropping moves card; mock service persists |
| E3-S4 | Property intake form with Zod validation | new property appears in pipeline |
| E3-S5 | Property detail hub layout + tabs (Overview tab populated; others = EmptyState) | clickable tabs, breadcrumbs |
| E3-S6 | Client/owner detail page (Screen 07) | linked from detail hub |
| E3-S7 | **Playwright** — full happy path: login → new property → see in pipeline → drag to "assessed" → open detail → see tabs | green spec |

## Approval Status

Proposed.

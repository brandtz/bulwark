# Epic E12 — Subcontractor Portal

> **Phase**: 2 | **Build order**: 13th | **Depends on**: E11
>
> The demo's `sub/` portal screens are the visual reference; this epic builds
> the production version with real auth, real data, and zero financial leak.

## Objective

Sub-contractor users (`sub_contractor` role) log in to a stripped-down portal
showing only the jobs assigned to their company. Pricing fields are removed
from contracts at the API boundary (not just hidden in UI).

## Stories

| ID | Title |
|---|---|
| E12-S1 | Sub login flow + magic-link option |
| E12-S2 | Sub dashboard / assigned jobs list (SUB-02) |
| E12-S3 | Sub job detail (SUB-03) — scope/schedule/materials, no $ values |
| E12-S4 | Sub status update + photo capture (SUB-04) |
| E12-S5 | Sub profile (SUB-05) + license/COI tracking |

## Approval Status

⏸️ **Deferred — gated on E11.** Real auth (E11-S3) is required for the cross-tenant `sub_contractor` login, and the real WorkOrder service (E11-S8) is required for assignment delivery. Mock-layer prototypes can begin once E11 is in flight; cannot ship before E11-S3 + E11-S8 land.

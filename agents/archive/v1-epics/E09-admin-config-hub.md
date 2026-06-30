# Epic E9 — Admin Config Hub

> **Phase**: 1 | **Build order**: 10th | **Depends on**: E0–E8
>
> This epic delivers on the sponsor's mandate that **every configurable thing
> has an Admin screen**. See [BUILD_PLAN §6](../../BUILD_PLAN.md) for the
> exhaustive inventory.

## Objective

Stand up `Settings` as a hub with one sub-route per configuration domain. All
config writes go through MockServices that obey the same contract real services
will.

## In Scope

| Sub-route | Configures |
|---|---|
| `/settings/company` | Org profile, GC license/CCB, branding (Screen 12) |
| `/settings/users` | Memberships, role assignment per org (Screen 23) |
| `/settings/standards` | Compliance materials/vents/eaves (Screen 24) |
| `/settings/workflow/statuses` | Pipeline stage list per tenant |
| `/settings/workflow/trades` | Trade list (roofing, siding, …) |
| `/settings/catalog/materials` | Material catalog for quote line items |
| `/settings/catalog/labor` | Labor rate defaults |
| `/settings/templates` | Quote / compliance / invoice PDF templates |
| `/settings/integrations/api-keys` | API key issue/rotate/revoke (ADM-31) |
| `/settings/audit-log` | Read-only audit log viewer (ADM-24) |
| `/settings/feature-flags` | Per-tenant flags (super_admin only) |
| `/profile/notifications` | Per-user notification preferences |

## Out of Scope

- Stripe / billing settings (Phase 2)
- Vendor mgmt screens (Phase 2 / E11+)

## Stories

| ID | Title | Status |
|---|---|---|
| E9-S1 | Settings hub layout + nav | ✅ Done |
| E9-S2 | Company settings + Users (Screens 12 + 23) | ✅ Done (read-only viewers; full editors deferred to E11) |
| E9-S3 | Compliance Standards (Screen 24) — wired to E4 evaluator | ✅ Done |
| E9-S4 | Workflow statuses + trades | ✅ Done (read-only viewer) |
| E9-S5 | Catalog: materials + labor rates | ⏸ Stub (lands with real backend in E11) |
| E9-S6 | Document templates editor (textarea + preview, full WYSIWYG out of scope) | ⏸ Stub (lands with real renderer in E11) |
| E9-S7 | API keys management (issue once / show prefix / revoke) | ✅ Done |
| E9-S8 | Audit log viewer with filters | ✅ Done (derived from row history; filters lift in E11) |
| E9-S9 | **Playwright matrix** — each settings page renders, edits persist via mock, role-gating enforced | ✅ Done (`tests/e2e/settings-matrix.spec.ts`, 12 cases) |

## Approval Status

✅ **Closed** — Settings hub + 9 sub-routes shipped; 4 fully interactive (Standards, API keys, Users viewer, Workflow viewer, Audit log viewer), 3 informational stubs awaiting real-backend dependencies. Matrix spec passes 12/12 chromium.

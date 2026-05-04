# Epic E11 — Backend Wiring (services + DB)

> **Phase**: 1 → 2 | **Build order**: 12th | **Depends on**: E0–E10
>
> The big swap. Each story replaces one MockService with the real Drizzle-backed
> service, in dependency order. E2E tests re-run against real backend after
> each swap to catch contract drift.

## Objective

Every domain service moves from `Mock<X>Service` to `Real<X>Service`. The UI
doesn't change — the `useService('property')` composable just resolves to the
real implementation when `process.env.BULWARK_BACKEND === 'real'`.

## In Scope (per story = one service swap)

- AuditService (mandatory in every other write transaction; built first)
- Auth (real JOSE + nuxt-auth-utils + bcrypt)
- Tenancy firewall (`requireOrgMembership`)
- Property + Client services
- Assessment service
- Quote service
- Work Order + Subcontractor services
- Compliance service + real Puppeteer PDF + R2 upload
- Invoice service
- Job service (real background runner)
- ApiKey service

## Stories

| ID | Title |
|---|---|
| E11-S1 | Drizzle migrations applied to local Postgres + Neon staging |
| E11-S2 | RealAuditService + transaction helper |
| E11-S3 | RealAuthService (JOSE, bcrypt, nuxt-auth-utils) |
| E11-S4 | Tenant firewall middleware live |
| E11-S5 | RealPropertyService + RealClientService |
| E11-S6 | RealAssessmentService |
| E11-S7 | RealQuoteService |
| E11-S8 | RealWorkOrderService + RealSubcontractorService |
| E11-S9 | RealJobService (background worker) |
| E11-S10 | RealComplianceService — Puppeteer PDF, R2 signed URL |
| E11-S11 | RealInvoiceService |
| E11-S12 | RealApiKeyService + scope enforcement |

Each story re-runs the **full Playwright suite** against the real backend
before marking complete. CI gains a `BACKEND=real` job alongside `BACKEND=mock`.

## Approval Status

Proposed.

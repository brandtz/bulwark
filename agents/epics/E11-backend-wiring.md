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

| ID | Title | Status |
|---|---|---|
| E11-S1 | Drizzle migrations applied to local Postgres + Neon staging | ✅ Done (local; Neon deferred) |
| E11-S2 | RealAuditService + transaction helper | Not started |
| E11-S3 | RealAuthService (JOSE, bcrypt, nuxt-auth-utils) | Not started |
| E11-S4 | Tenant firewall middleware live | Not started |
| E11-S5 | RealPropertyService + RealClientService | Not started |
| E11-S6 | RealAssessmentService | Not started |
| E11-S7 | RealQuoteService | Not started |
| E11-S8 | RealWorkOrderService + RealSubcontractorService | Not started |
| E11-S9 | RealJobService (background worker) | Not started |
| E11-S10 | RealComplianceService — Puppeteer PDF, R2 signed URL | Not started |
| E11-S11 | RealInvoiceService | Not started |
| E11-S12 | RealApiKeyService + scope enforcement | Not started |

Each story re-runs the **full Playwright suite** against the real backend
before marking complete. CI gains a `BACKEND=real` job alongside `BACKEND=mock`.

## Approval Status

🟢 **Ready to start** — All five infrastructure decisions locked by [ADR-0012](../decisions/ADR-0012-phase2-infrastructure.md) on 2026-05-05:

| Concern | Decision |
|---|---|
| Postgres (dev) | Local PostgreSQL 18 service `postgresql-x64-18`, role `bulwark_app`, db `bulwark_dev` |
| Postgres (staging/prod) | Neon (deferred until first deploy milestone) |
| Auth | `bcryptjs` + `nuxt-auth-utils` session cookies (no SSO for v1) |
| Object storage | Cloudflare R2 |
| Background jobs | `pg-boss` worker as a separate Node process (Render/Railway) |
| Hosting | Vercel for Nuxt app |
| Payments | Stripe (E13-S7 only) |

**Single remaining unblock**: sponsor pastes the `DATABASE_URL=postgresql://bulwark_app:...@localhost:5432/bulwark_dev` connection string into `bulwark/.env.local`. Then E11-S1 starts.

Every subsequent story is one service swap behind a `BULWARK_BACKEND=real` env flag, with the full Playwright suite re-run against the real backend before merge. Mock services stay alive in parallel so the dev loop never goes dark.

## Downstream Impact

- **E12 (Subcontractor Portal)** depends on real auth (E11-S3) for sub login + on the real WorkOrder service (E11-S8) for cross-tenant assignment delivery. Strict serial per ADR-0012 §7.
- **E13 (Homeowner Portal)** depends on real auth + real Invoice service (E11-S11) for the homeowner pay-link. Strict serial per ADR-0012 §7.

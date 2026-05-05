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

⏸️ **Deferred (gating: infrastructure)** — All twelve stories are coding-ready (contracts + mock services already pin every method signature, and the suite at sha `387f3bc` covers 128 chromium + 35 unit paths against the mock layer). E11 cannot start until the sponsor provisions:

1. **Postgres**: a Neon project (or equivalent managed Postgres) with a staging database URL exposed as `DATABASE_URL`.
2. **Drizzle migration target**: connection string for local + staging so `drizzle-kit push` has somewhere to land.
3. **Auth backing store**: confirmation of password storage (bcrypt rounds), session strategy (cookie vs JWT vs `nuxt-auth-utils`), and any IdP integration (Microsoft Entra? Google Workspace? local-only?).
4. **R2 / object storage**: AWS S3 or Cloudflare R2 bucket for compliance-doc PDFs (+ signed-URL signer key).
5. **Background-runner host**: decision on inline jobs (same Nuxt server) vs a dedicated worker process for E11-S9.

When those land, E11-S1 (migrations) is the kickoff story — every subsequent story is one service swap behind a `BULWARK_BACKEND=real` env flag, with the full Playwright suite re-run against the real backend before merge. Until then the mock services keep the UX honest and unblock E12 / E13 design conversations.

## Downstream Impact

- **E12 (Subcontractor Portal)** depends on real auth (E11-S3) for sub login + on the real WorkOrder service (E11-S8) for cross-tenant assignment delivery. Cannot start before E11 is in flight.
- **E13 (Homeowner Portal)** depends on real auth + real Invoice service (E11-S11) for the homeowner pay-link. Cannot start before E11 is in flight.

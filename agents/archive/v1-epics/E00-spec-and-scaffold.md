# Epic E0 — Spec & Scaffold

> **Phase**: 0 | **Build order**: 1st (gates everything else) | **Owner**: orchestrator + architect roles
>
> Nothing else can be built until this epic completes. It establishes the law:
> the contracts the UI mocks against, the contracts the backend will satisfy,
> the test harness, and the project skeleton.

## Objective

Stand up a runnable Nuxt 3 project at the repo root with:
- All design tokens wired into Tailwind
- All Drizzle schemas defined (no migrations applied yet)
- All Zod contracts in `shared/contracts/`
- Error taxonomy file
- Mock service scaffolding the UI will consume in E1–E10
- Playwright + Vitest configured with one passing smoke test
- GitHub Actions CI gating typecheck / lint / playwright / vitest

## User / Business Value

The sponsor cannot diagnose UI work that doesn't exist. This epic produces the
soil. No screen yet — but the next epic (E1) can plant immediately and every
following epic plants in the same soil.

## In Scope

- `nuxt.config.ts`, `tsconfig.json` (strict), `package.json` with pinned deps
- `app/` directory structure per [BUILD_PLAN §3](../../BUILD_PLAN.md)
- `tailwind.config.ts` consuming `app/assets/css/tokens.css`
- `server/db/schema/` — full Drizzle schema, no migrations
- `server/errors/index.ts` — error taxonomy
- `shared/contracts/` — Zod schemas for: organization, user, membership, property, client, assessment, quote, work-order, subcontractor, compliance-doc, invoice, audit-log, api-key, job
- `shared/mocks/MockServiceFactory.ts` + one mock per domain
- `shared/nav/nav.config.ts` skeleton (filled in E1)
- `playwright.config.ts`, `vitest.config.ts`, `tests/e2e/smoke.spec.ts`
- `.github/workflows/ci.yml`
- 11 ADRs in `agents/decisions/`
- Lift `docs/CONVENTIONS.md` into root (per CONVENTIONS.md own §1)

## Out of Scope

- Any visible page (E1's job)
- Any real DB connection or migration (E11's job)
- Any auth implementation (E2's job)

## Dependencies

None — this is the root.

## Risks

- **Lock-in too early**: ADRs land before any code proves them out. Mitigation: ADR Status starts `Proposed`; flip to `Accepted` only when downstream epic uses the decision without pain.
- **Mock contract drifts from real**: tests in E11 must run E2E specs against real backend. CI will catch drift the moment it happens.

## Stories

| ID | Title | Visible delta |
|---|---|---|
| E0-S1 | Lift docs into root + write CONTRACTS / DECISIONS / UI-CONTRACTS skeletons + 11 ADRs | doc tree only |
| E0-S2 | Init Nuxt 3 project + folder structure + strict tsconfig | `pnpm dev` boots a blank "Bulwark" page |
| E0-S3 | Tailwind config + tokens.css from STYLE_GUIDE | tokens visible via a `/_tokens` debug route |
| E0-S4 | Drizzle schema for all tables (no migrations) | `pnpm drizzle-kit check` passes |
| E0-S5 | Zod contracts in `shared/contracts/` | typecheck passes, contracts import in mocks |
| E0-S6 | MockServiceFactory + per-domain mock services with realistic fixture data | `useService('property').list()` returns mock data in a debug page |
| E0-S7 | Playwright + Vitest config + smoke test (boot + nav to `/`) | green local + green in CI |
| E0-S8 | GitHub Actions CI: typecheck / lint / playwright / vitest | green badge in README |

## Review Notes

_Pending architect role sign-off after S1–S8 land._

## Approval Status

Proposed — awaiting human sponsor confirmation that the slice list is right.

# Epic E7 — Compliance Documents (async PDF)

> **Phase**: 1 | **Build order**: 8th | **Depends on**: E6

## Objective

Generate the homeowner-and-insurer-facing compliance package as a PDF using
the **always-async job pattern** (TECH §9). Mock job runner returns a fake
URL after a 2s timer; E11 wires real Puppeteer.

## In Scope

- `app/pages/properties/[id]/compliance/new.vue` (Screen 19) — generator: pick scope, capture GC signature
- `app/pages/properties/[id]/compliance/[docId].vue` (Screen 20) — preview + download
- `shared/utils/asyncJob.ts` — `useJob(jobId)` composable with polling
- `shared/mocks/MockJobService.ts` — fake job queue
- `shared/contracts/compliance.ts`, `job.ts`

## Stories

| ID | Title | Visible delta |
|---|---|---|
| E7-S1 | `useJob` polling composable + MockJobService | unit test green |
| E7-S2 | Compliance generator UI — checklist of WO items, signature pad | sponsor walks through |
| E7-S3 | "Generating…" state → preview → download (mock URL) | full async UX visible |
| E7-S4 | **Playwright** — generate doc → wait for ready state → see preview | green spec |

## Approval Status

Proposed.

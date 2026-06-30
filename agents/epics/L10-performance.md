# L10 — Performance Budget

> **Phase:** A (Wave 3) · **Autonomy:** AUTO · **Depends on:** L06, L08
> **Owns gap-register:** §3.9.1–3.9.2 · **Decision:** ADR-0008

## Purpose
The launch gate sets API p95 < 400 ms on primary endpoints and Lighthouse ≥ 90 on the
top routes, enforced in CI. Today there is no budget, no Lighthouse run, and no latency
assertion. This epic instruments and enforces both, then fixes whatever the data shows
(leaning on the L06 indexes and L08 latency metrics).

## Key decisions (ADR-0008)
- **Lighthouse CI** (`@lhci/cli`) runs against a built app on the top 10 routes with a
  budget assertion (perf/a11y/best-practices ≥ 90). Mobile + desktop profiles.
- **API latency** asserted by an integration test that exercises the primary list/detail
  endpoints over a seeded dataset and fails if measured p95 > 400 ms locally (with margin),
  backed by the L08 metrics in staging.

## Stories

### L10-S1 — Lighthouse CI budget gate
- **CI:** `lighthouserc.cjs` with route list + assertions; job builds, serves, runs LHCI.
- **Tests/Acceptance:** green on the top 10 routes; a regressed bundle/route fails the budget.

### L10-S2 — API latency assertion harness
- **Tests:** `tests/integration/perf.test.ts` — seed N rows, time the primary list/detail/
  search endpoints, assert p95 under threshold; report a table.
- **Acceptance:** all primary endpoints under budget on the seeded set.

### L10-S3 — Query + payload optimization (data-driven)
- **Server/Client:** act on findings — ensure list endpoints use L06 indexes + pagination,
  select only needed columns, avoid over-fetch; lazy-load heavy client chunks (charts,
  signature pad, PDF preview) and defer non-critical hydration.
- **Tests:** latency harness re-run shows improvement; bundle-size check on heavy routes.

### L10-S4 — Caching + asset headers
- **Server:** appropriate `Cache-Control` on static + signed-asset responses; SSR data
  `server:false` only where correct; verify no accidental no-store on cacheable GETs.
- **Acceptance:** Lighthouse + latency gates green and wired into CI as required checks.

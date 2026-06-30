# ADR-0008 — Quality gates as CI (a11y, performance)

- **Status:** Accepted (2026-06-30) · **Epic:** L09, L10, L20

## Context
WCAG 2.1 AA and a performance budget (API p95 < 400 ms; Lighthouse ≥ 90) are launch
gates, but nothing enforces them. Aspirational quality bars drift.

## Decision
Make the quality bar **executable in CI**:
- **Accessibility**: `@axe-core/playwright` runs on one representative route per surface;
  **zero serious/critical** violations is a merge gate; a manual keyboard pass is documented.
- **Performance**: **Lighthouse CI** asserts ≥ 90 (perf/a11y/best-practices) on the top 10
  routes (mobile + desktop); an **API latency** integration test asserts p95 < 400 ms on the
  primary endpoints over a seeded dataset, backed by L08 latency metrics in staging.

## Consequences
- Regressions in a11y/perf fail the build instead of shipping; the launch sign-off (L20) is
  a re-run of these gates, not a new manual effort.

## Alternatives rejected
- Manual periodic audits (drift between audits). Perf "by inspection" (no objective bar).

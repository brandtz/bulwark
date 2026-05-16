# ADR-0030 — Reporting + Dashboards surface

- **Status:** Accepted
- **Date:** 2026-05-15
- **Slice:** W3-2 / EH-K
- **Owners:** Build agents

## Context

Wave 2 landed rich operational data (programs, inspections, quote
tiers/revisions, work-order scheduling, invoice payments, retainage,
change orders, compliance docs). The admin needs an operating dashboard
plus a small reports surface to turn that data into something a GC owner
can act on in under a minute. Without it, Bulwark is "a database with
forms" and is hard to demo against ServiceTitan.

Goals for W3-2:

1. Replace the placeholder `/admin` index with a real dashboard — KPIs
   plus a handful of charts that update with a date-range picker.
2. Ship a `/admin/reports/*` surface with the five highest-value reports
   GCs ask for: revenue, subcontractor performance, inspection pass
   rate, AR aging, top properties.
3. Stay dependency-free (no chart library, no CSV library) so we don't
   pay a bundle-size tax for the first MVP.

## Decisions

### D1. Single read-only `IReportingService` owns aggregation.

Every page reads through `useService('reporting')`. No page touches
Drizzle, and no other service is forced to grow an analytic API. This
keeps:

- Tenant firewall in one place (every reporting query calls
  `assertSameTenant`).
- Aggregation pushed into Postgres (`sum`, `count`, `case when`,
  `date_trunc`) — no in-memory fan-out of full row sets.
- A clean seam for future promotion to a read replica or a materialized
  view layer without touching page code.

### D2. Hand-rolled SVG charts under `app/components/charts/`.

`Donut.vue`, `Bar.vue`, `Sparkline.vue` are ~80 LOC each, take a small
prop shape, and render plain SVG against the brand palette from
Tailwind config. We considered Chart.js, ECharts, and Vue-ChartJS and
rejected all three: bundle weight (≥80 KB gz minimum), opaque a11y
behavior, and overkill for the four chart types we actually need.

If the surface grows to scatter / heatmap / treemap in a later phase,
that is the right moment to adopt a lib — by then we will have lived
with the data shape long enough to make a measured choice.

### D3. CSV export is a Blob + `URL.createObjectURL` composable.

`app/composables/useCsvExport.ts` takes `{ rows, columns, filename }`,
escapes per RFC 4180, and triggers a browser download. No `papaparse`,
no server round-trip. Tested for commas / quotes / newlines in
`tests/unit/csv-export.test.ts`.

Server-side export (audit log CSV, large multi-million-row exports)
already lives in `audit.real.ts.exportCsv` (W2-4). Both paths share the
same escape rules but live in their own files because the call sites
are very different.

### D4. Date-range "deltas" are computed by calling `dashboardKpis`
twice.

The dashboard's KPI cards show "vs previous equivalent range" deltas.
Rather than adding a second `dashboardKpisWithDelta` method (and the
SQL gymnastics that implies), the page calls `dashboardKpis({range})`
and `dashboardKpis({previousRange})` and computes the delta client-side.
If the previous range total is zero we hide the delta to avoid
meaningless `+Inf` / `-100%` labels.

This is one extra round-trip per dashboard load, accepted because:

- The two calls run in parallel.
- The dashboard is a low-frequency page (open it, work elsewhere).
- It keeps the service surface honest (no "convenience" methods that
  bake page concerns into the service).

### D5. Read-only — no `withAudit`.

Reporting writes nothing. We deliberately skip `withAudit` to keep
analytic queries from polluting `audit_log`. If a future report
materializes user-visible "I looked at X" trails, that signal belongs in
`notifications` or a dedicated `report_views` table, not the audit
log.

## Rejected alternatives

- **A chart library** — see D2.
- **A CSV library** — see D3.
- **A separate `analytics_*` schema** — premature. SQL aggregates on
  the operational tables are fine for a single-tenant org's volume in
  Phase 1. We'll revisit when any single tenant crosses ~100k WOs or
  reports start blocking on aggregation cost.
- **A real-time websocket dashboard** — Phase 2. Polling every 30s is
  more than enough for an operating dashboard; the data doesn't change
  that fast.

## Consequences

- The admin can grok the operating state of the business in one screen
  — open quotes/value, scheduled WOs, overdue invoices/value, paid this
  month, compliance issues, plus the four charts and two top-N lists.
- Five exportable reports cover the bookkeeping + ops questions that
  drive a weekly review.
- Zero new npm deps for this slice.
- Future "exec dashboard" / "subcontractor scorecard" features can
  layer on top of `IReportingService` without renaming or refactoring.

## Known debt

- Charts are decorative — no tooltips, no drill-through. Acceptable for
  v1; tooltips planned for W4.
- No saved dashboards / no widget rearrangement. Acceptable for v1;
  Phase 2.
- AR aging buckets are hardcoded (0-30/31-60/61-90/90+). Per-org
  configurable bucket boundaries are a Phase 2 ask if any GC requests
  them.

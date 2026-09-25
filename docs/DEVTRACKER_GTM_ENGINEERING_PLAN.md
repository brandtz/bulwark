# DevTracker — Go-to-Market Engineering Plan (Next 3 Quarters)

> **Prepared by:** Director of Engineering, with story-point sizing counsel from the
> Lead QA Engineer.
> **Audience:** Product Management, Project Management, Program Management.
> **Purpose:** This document sizes the remaining engineering work required to take
> DevTracker to General Availability, in Agile story points, sequenced across the next
> three quarters. It is intended to drive **funding approval, resource allocation, and
> program direction** for that period.

---

## 1. How to Read This Document

- Work is organized as **Epics → Stories → Tasks**. Story points are assigned at the
  **Story** level, per standard Agile practice — this is the level at which sizing is
  meaningful and defensible. Tasks are listed under each story as an implementation
  checklist for engineering execution; they are not independently pointed.
- All estimates use the **Fibonacci story-point scale** defined in Section 2, calibrated
  against a **2-week sprint**.
- Every story carries a **target quarter** (Q1 / Q2 / Q3) reflecting priority and
  dependency order, not just chronological convenience. Section 4 explains the
  sequencing logic.
- Section 7 translates total story points into a **staffing recommendation** for each
  quarter. Section 8 carries the Lead QA Engineer's risk/confidence notes on which
  estimates are solid and which carry more sizing uncertainty.
- Dollar costing is intentionally left to Program/Finance to apply against current
  loaded rates; this document asks for **headcount and time**, not budget dollars.

---

## 2. Estimation Methodology

### 2.1 Story-point scale

| Points | Meaning | Rough guide |
|---|---|---|
| **1** | Trivial | A config change, copy edit, or one-line fix. Near-zero risk. Hours, not days. |
| **3** | Small | Well-understood, single engineer, minimal cross-team coordination. ~1–2 days. |
| **5** | Moderate | Single engineer, some design or edge-case work required. ~2–3 days. |
| **8** | Substantial | Most of a sprint for one engineer; touches multiple layers (data + service + UI) or carries moderate unknowns. |
| **13** | **Full sprint, 1 FTE.** | A complete 2-week sprint of focused work for one engineer — typically a new data model, service, UI surface, and test coverage together, or a high-complexity/high-unknown change. |
| **21** | **Full sprint, 2 FTE.** | Work large enough to require two engineers working in parallel (or in close pairing) for a full sprint. Used sparingly; a 21 is a signal the story should be evaluated for splitting before sprint planning. |

### 2.2 Sprint and quarter assumptions

- **1 sprint = 2 weeks.**
- **1 quarter ≈ 6 sprints** (12 weeks).
- The 3-quarter planning window covers **~18 sprints**.
- Story points reflect **sustained, average delivery capacity**, not the theoretical
  maximum of a single all-out story. The Lead QA Engineer's guidance (Section 8) is
  that teams should plan to a **conservative ~8–9 points per engineering FTE per
  sprint** on average across a mixed backlog (small stories, code review, support
  work, and QA collaboration all factored in) — the 13-point "one FTE, one sprint"
  reference case describes a single dedicated story, not a sustained weekly average.

---

## 3. Current State Summary

DevTracker has a working, multi-tenant core: property/client/contact records,
program-based inspection templates, tenant-configurable trades and status pipelines, a
quoting and work-order engine, subcontractor management, document generation, and admin
portals for internal staff, field crews, subcontractors, and property owners. The
platform's domain model was already generalized once, from a single fixed workflow into
a **program-based engine** — new lines of work are meant to be defined as configuration
(templates, standards, trades, pricing defaults) rather than code.

The work in this plan closes three categories of remaining gap between that current
state and a sellable, general-availability product:

1. **Finishing the generalization** — a handful of places where the platform still
   assumes its original single-program shape (a frozen trade list, a single terminal
   document type, seed-only status seed data) need to be opened up so the
   configuration-driven model is true everywhere, not just in the places it was first
   proven.
2. **Revenue and trust infrastructure** — online payments, security hardening, and
   data-integrity fixes that are required before the product can be sold and operated
   with real customer money and data.
3. **Horizontal feature completeness** — estimating/price-book, scheduling/dispatch,
   materials/vendor tracking, time tracking, notifications, and reporting depth: the
   table-stakes capabilities any contracting-operations buyer expects, which the
   platform does not yet have regardless of which program/vertical is running on top of
   it.

---

## 4. Three-Quarter Roadmap Overview

| Quarter | Theme | Total Points | Sprints | Exit Milestone |
|---|---|---|---|---|
| **Q1** | De-risk & unblock revenue | **155** | 1–6 | Generalization proven end-to-end; payments live in test mode; core security and data-integrity hardening complete. |
| **Q2** | Horizontal feature completeness | **166** | 7–12 | Estimating, scheduling, notifications, reporting, and portal completeness shipped — the feature set required to sell across multiple trades. |
| **Q3** | Operational depth & launch gate | **176** | 13–18 | Materials/vendor/time-tracking/job-costing, field offline capability, additional standards packs, legal sign-off, full security/regression pass — General Availability readiness. |
| **Total** | | **497** | 18 | GA-ready |

**Sequencing logic:**
- Q1 front-loads the lowest-risk, highest-leverage generalization fixes (Epic 1) and
  the two things nothing else can be sold without: **payments** and **security**.
  Data-integrity fixes (race-safe numbering, missing indexes) are pulled forward
  because they are correctness bugs, not features.
- Q2 is deliberately the heaviest quarter: it is where the horizontal, buyer-facing
  feature set (estimating, dispatch, notifications, reporting, portal completeness)
  gets built, once the Q1 foundation is stable underneath it.
- Q3 sequences the remaining depth features (materials/vendor/time-tracking/job
  costing, field offline capability) that are valuable but not launch-blocking for an
  initial cohort of customers, alongside the final legal and launch-readiness gate.

---

## 5. Epic Summary

| # | Epic | Total Pts | Stories | Q1 | Q2 | Q3 |
|---|---|---|---|---|---|---|
| E01 | Domain & Program Generalization Completion | 50 | 7 | 26 | 21 | 3 |
| E02 | Payments & Monetization | 42 | 7 | 24 | 18 | 0 |
| E03 | Security & Auth Hardening | 32 | 7 | 32 | 0 | 0 |
| E04 | Data Layer & Performance | 28 | 5 | 20 | 8 | 0 |
| E05 | Observability & Launch Infrastructure | 26 | 5 | 8 | 5 | 13 |
| E06 | Notifications System | 25 | 5 | 15 | 10 | 0 |
| E07 | Estimating & Price Book | 47 | 6 | 16 | 21 | 10 |
| E08 | Scheduling & Dispatch | 42 | 6 | 8 | 13 | 21 |
| E09 | External Stakeholder Portal | 31 | 5 | 0 | 13 | 18 |
| E10 | Reporting & Dashboards | 29 | 5 | 0 | 21 | 8 |
| E11 | Portal Completeness (Owner + Subcontractor) | 18 | 4 | 3 | 15 | 0 |
| E12 | Field Mobile Depth & Offline | 35 | 5 | 0 | 11 | 24 |
| E13 | Materials, Vendor & Job Costing | 34 | 5 | 0 | 0 | 34 |
| E14 | Standards & Compliance Packs | 18 | 3 | 0 | 5 | 13 |
| E15 | Accessibility & Design Polish | 16 | 4 | 3 | 5 | 8 |
| E16 | Legal, Security Review & Launch Gate | 24 | 4 | 0 | 0 | 24 |
| | **Total** | **497** | **83** | **155** | **166** | **176** |

---

## 6. Detailed Epic → Story → Task Breakdown

### E01 — Domain & Program Generalization Completion (50 pts)

*Why this is first: the platform's core value proposition is that new lines of work are
configuration, not code. Proving that end-to-end — and closing the handful of places
where it isn't fully true yet — is the cheapest, highest-leverage work in the entire
plan, and de-risks every horizontal feature built afterward.*

| Story | Points | Quarter |
|---|---|---|
| **S1.** Validate a second, structurally different program end-to-end using only admin configuration (no code changes) | 8 | Q1 |
| **S2.** Replace the frozen built-in trade list with live trade-catalog validation on work orders and subcontractor records | 8 | Q1 |
| **S3.** Decouple status values from single-program seed data; confirm the pipeline configuration is the sole runtime authority | 5 | Q1 |
| **S4.** Retire the legacy hardcoded evaluation logic in favor of the generic rule engine | 5 | Q1 |
| **S5.** Generalize the terminal deliverable template (single fixed output → configurable output kind: package / report / certificate / none) | 13 | Q2 |
| **S6.** Author and seed two additional inspection programs end-to-end, for sales and demo proof | 8 | Q2 |
| **S7.** Update product marketing and dashboard copy to remove single-vertical framing | 3 | Q3 |

**Task detail:**
- S1: define an acceptance script for a structurally different program; configure it via program, template, standards, and trade admin surfaces; run a property through quote → work order → invoice; log every point requiring a code change as a defect.
- S2: widen validation on work-order trade slots and subcontractor trade fields to read from the live trade catalog; migrate existing records; add regression coverage.
- S3: audit every runtime check against the legacy status enums; route all of them through the pipeline configuration; remove enum-level constraints once confirmed safe.
- S4: identify remaining callers of the legacy evaluator; port to the generic rule engine; remove the legacy code path once parity is verified.
- S5: design the configurable output-kind model; migrate the renderer, signature capture, and branding to the new model; verify the existing deliverable still renders identically.
- S6: author two new program definitions (template, standard set where applicable, trade defaults); validate with QA and Sales/Product stakeholders.
- S7: audit all customer-facing copy for single-vertical language; replace with neutral platform framing.

---

### E02 — Payments & Monetization (42 pts)

*Why this is early: no revenue moves through the platform without this. Test-mode
completion is the Q1 bar; refunds and the polished pay experience follow in Q2.*

| Story | Points | Quarter |
|---|---|---|
| **S1.** Payment provider account and configuration plumbing (secure secret storage, test-mode keys) | 3 | Q1 |
| **S2.** Hosted checkout session for invoice payment | 8 | Q1 |
| **S3.** Webhook handling with signature verification and idempotency | 8 | Q1 |
| **S4.** Payment reconciliation against the invoice ledger | 5 | Q1 |
| **S5.** Refund workflow | 5 | Q2 |
| **S6.** Customer-facing "pay now" experience, confirmation, and receipt | 5 | Q2 |
| **S7.** Negative-path test suite: webhook replay, double-charge, partial payment | 8 | Q2 |

**Task detail:**
- S1: provision test-mode credentials; store via the existing sealed provider-config pattern; add config validation.
- S2: build checkout-session creation tied to invoice ID and organization; handle success/cancel redirects.
- S3: verify webhook signatures; make event processing idempotent by event ID; log all events for audit.
- S4: link webhook events to invoice records via metadata; recompute paid/remaining balance; add balance-guard validation before recording a payment.
- S5: build partial and full refund support with ledger entries and audit trail.
- S6: build the property-owner-facing payment page, confirmation state, and downloadable receipt.
- S7: author automated tests for replayed webhooks, duplicate charges, and over-payment attempts.

---

### E03 — Security & Auth Hardening (32 pts)

*Why this is entirely in Q1: none of this is optional before real customer data and
money are in the system. It is also foundational — later epics build on the permission
and session model this epic hardens.*

| Story | Points | Quarter |
|---|---|---|
| **S1.** CSRF protection on all state-changing requests | 5 | Q1 |
| **S2.** Organization-level MFA enforcement policy (disabled / optional / required) | 5 | Q1 |
| **S3.** Session idle timeout and brute-force lockout | 5 | Q1 |
| **S4.** Password strength and breach-check enforcement | 3 | Q1 |
| **S5.** Authentication event audit trail | 3 | Q1 |
| **S6.** Automated dependency and static-analysis scanning in CI | 3 | Q1 |
| **S7.** Granular permission-matrix foundation | 8 | Q1 |

**Task detail:**
- S1: implement double-submit CSRF tokens across the write-path dispatcher; add regression tests.
- S2: add an org-level policy setting; enforce at login/session-elevation; add admin UI.
- S3: add configurable idle-timeout; add lockout after repeated failed attempts with backoff.
- S4: enforce minimum password strength; integrate a breach-check service; surface clear user-facing errors.
- S5: log all authentication events (login, lockout, password reset, MFA changes) to the audit trail.
- S6: add a CI job for dependency vulnerability scanning and static analysis; fail the build on new high/critical findings.
- S7: design a permission-row model beneath the existing role bundles; wire read-only enforcement in the highest-risk surfaces first.

---

### E04 — Data Layer & Performance (28 pts)

*Why this is early: the numbering-race and missing-index issues are data-integrity bugs,
not polish, and get more expensive to fix the longer real data accumulates on top of them.*

| Story | Points | Quarter |
|---|---|---|
| **S1.** Composite indexes on hot tables (properties, quotes, invoices, work orders, inspections) | 5 | Q1 |
| **S2.** Race-safe sequential numbering with a database uniqueness constraint | 5 | Q1 |
| **S3.** Cursor-based pagination for high-volume list views | 5 | Q1 |
| **S4.** Eliminate N+1 query patterns on list endpoints | 5 | Q1 |
| **S5.** Automated performance budget gate (page load + API latency) in CI | 8 | Q2 |

**Task detail:**
- S1: identify hot query paths; add composite indexes; verify via query-plan review.
- S2: replace count-based number generation with a database sequence/unique constraint; add a concurrency regression test.
- S3: add cursor-based pagination as an option on the highest-volume list endpoints.
- S4: identify and fix N+1 patterns on document and property list endpoints.
- S5: wire a synthetic performance check into CI with a defined latency/Lighthouse budget; fail builds that regress it.

---

### E05 — Observability & Launch Infrastructure (26 pts)

*Spread across all three quarters deliberately: basic monitoring goes in early so every
other epic is built with visibility into failures; production cutover work lands at the
end, closest to launch.*

| Story | Points | Quarter |
|---|---|---|
| **S1.** Error-monitoring integration (frontend + backend) | 5 | Q1 |
| **S2.** Health/readiness endpoint and migration-drift startup check | 3 | Q1 |
| **S3.** Metrics exposition and log aggregation | 5 | Q2 |
| **S4.** Managed production database cutover (migration + backup runbook) | 5 | Q3 |
| **S5.** Production deployment runbook, secrets checklist, canary and rollback procedure | 8 | Q3 |

**Task detail:**
- S1: wire error tracking on both client and server; verify 5xx and unhandled client errors are captured with useful context.
- S2: add a health/readiness endpoint; check for unapplied migrations at boot and fail closed.
- S3: expose metrics for scraping; ship structured logs to an aggregator.
- S4: cut over from local/dev database to a managed production instance; document migration and backup/restore procedure.
- S5: write the full deploy runbook, environment/secrets checklist, canary rollout plan, and rollback steps.

---

### E06 — Notifications System (25 pts)

*The "fail-loud" comms stories are pulled into Q1 because silent notification failure is
a trust-breaking defect, not a feature gap; the notification center and preferences are
Q2 polish on top.*

| Story | Points | Quarter |
|---|---|---|
| **S1.** In-app notification center with persistent history | 5 | Q1 |
| **S2.** Per-user, per-event notification preferences | 5 | Q2 |
| **S3.** Fail-loud email delivery (remove silent stub fallback; add delivery log) | 5 | Q1 |
| **S4.** Fail-loud SMS delivery (same hardening pattern) | 5 | Q1 |
| **S5.** Template editor for email/SMS content | 5 | Q2 |

**Task detail:**
- S1: build a persisted, in-app notification feed backed by the audit trail.
- S2: allow users to opt in/out per event type and channel.
- S3: replace the silent-stub fallback with a surfaced, audited failure and an admin-visible delivery log.
- S4: apply the same fail-loud pattern to SMS delivery.
- S5: build an editor for notification content, backed by the existing label/content override system.

---

### E07 — Estimating & Price Book (47 pts)

*The single highest-leverage horizontal feature: consistent, catalog-driven pricing is
what makes the platform usable across many trades instead of one program's line items
typed fresh every time.*

| Story | Points | Quarter |
|---|---|---|
| **S1.** Price-book data model: labor rates, material SKUs, cost codes | 8 | Q1 |
| **S2.** Assemblies: bundled kits mapping to trade and catalog items | 8 | Q1 |
| **S3.** Quote-builder integration with catalog-sourced line items (backward compatible with free-typed entry) | 13 | Q2 |
| **S4.** Admin catalog management UI, including import/export | 8 | Q2 |
| **S5.** Per-catalog markup/tax default overrides | 5 | Q3 |
| **S6.** Regression coverage: catalog-sourced vs. custom quote line items | 5 | Q3 |

**Task detail:**
- S1: model labor rate, material SKU, and cost-code entities, org-scoped.
- S2: model assemblies (bundled kits) that map to a trade and a set of catalog items with quantities.
- S3: extend the quote builder to pull line items from the catalog while preserving today's free-typed line-item flow for one-off quotes.
- S4: build admin CRUD for the catalog, including bulk import/export.
- S5: allow markup/tax overrides at the catalog-item or assembly level, layered on existing program-level pricing defaults.
- S6: build regression coverage across both quote-authoring paths.

---

### E08 — Scheduling & Dispatch (42 pts)

*Table-stakes against every competing field-service tool; the calendar data model is
pulled into Q1 so downstream teams can build against it as soon as possible.*

| Story | Points | Quarter |
|---|---|---|
| **S1.** Crew/resource calendar data model and conflict-detection rules | 8 | Q1 |
| **S2.** Dispatch board UI (calendar view, drag-and-drop assignment) | 13 | Q2 |
| **S3.** Subcontractor availability and assignment conflict warnings | 8 | Q3 |
| **S4.** Field-portal "my jobs today" dispatch-aware view | 5 | Q3 |
| **S5.** Schedule-change notification triggers | 3 | Q3 |
| **S6.** Automated coverage for dispatch conflict scenarios | 5 | Q3 |

**Task detail:**
- S1: model crews/resources, scheduled slots, and conflict rules against existing work-order schedule fields.
- S2: build a calendar UI with drag-and-drop assignment, replacing the current placeholder dispatch page.
- S3: surface subcontractor availability and warn on double-booking or conflicting assignments.
- S4: build a dispatch-aware "my jobs today" view in the field portal.
- S5: trigger notifications (via E06) on schedule changes affecting a crew or subcontractor.
- S6: build automated test coverage for conflict-detection edge cases.

---

### E09 — External Stakeholder Portal (31 pts)

*Generalized deliberately: rather than building a single-purpose external portal, this
epic builds one reusable, scoped, read-only external-access pattern usable for any
third-party stakeholder relationship the business needs (referral partners, inspectors,
lenders, property-management companies, etc.).*

| Story | Points | Quarter |
|---|---|---|
| **S1.** Generalized read-only external-stakeholder role and scoping model | 8 | Q2 |
| **S2.** Organization/property/program linkage and admin management UI | 5 | Q2 |
| **S3.** Multi-property, read-only reporting surface | 8 | Q3 |
| **S4.** Passwordless (magic-link) authentication for external stakeholders | 5 | Q3 |
| **S5.** Tenant-isolation test coverage for the new role | 5 | Q3 |

**Task detail:**
- S1: design a role that is read-only, explicitly scoped (never full-org access), and reusable across external-stakeholder types.
- S2: build the admin surface to link an external stakeholder to specific properties/programs.
- S3: build a reporting view spanning every property/program a stakeholder is linked to.
- S4: implement magic-link auth for this role, matching the security bar of the rest of the platform.
- S5: build a dedicated permission/tenant-isolation test matrix for this role before it ships.

---

### E10 — Reporting & Dashboards (29 pts)

| Story | Points | Quarter |
|---|---|---|
| **S1.** Executive KPI dashboard (revenue, jobs/month, conversion rate) on live data | 8 | Q2 |
| **S2.** Accounts-receivable aging report | 5 | Q2 |
| **S3.** Sales conversion funnel report | 5 | Q2 |
| **S4.** Job-cost report: estimated vs. actual (depends on E13) | 8 | Q3 |
| **S5.** Standardized CSV export across reporting surfaces | 3 | Q2 |

**Task detail:**
- S1: build a live-data KPI dashboard for admin/ownership roles.
- S2: build an AR-aging report against outstanding invoices.
- S3: build a lead-to-job conversion funnel report.
- S4: build an estimated-vs-actual job-cost report once time tracking and job costing (E13) exist.
- S5: standardize CSV export behavior across all reporting surfaces.

---

### E11 — Portal Completeness: Owner + Subcontractor (18 pts)

| Story | Points | Quarter |
|---|---|---|
| **S1.** Client/property-owner detail views (replace placeholder states) | 5 | Q2 |
| **S2.** Client-facing invoice document and document library | 5 | Q2 |
| **S3.** Subcontractor work-order/quote detail views | 5 | Q2 |
| **S4.** Subcontractor profile and settings completion | 3 | Q1 |

**Task detail:**
- S1: replace empty-state placeholders in the property-owner portal with real detail views.
- S2: build a real invoice document and a document library for the property-owner portal.
- S3: build real work-order and quote detail views for the subcontractor portal.
- S4: complete the subcontractor profile/settings surface.

---

### E12 — Field Mobile Depth & Offline (35 pts)

| Story | Points | Quarter |
|---|---|---|
| **S1.** Field photo capture (camera + gallery + secure upload + categorization + geotag) | 8 | Q2 |
| **S2.** Signature capture as a shared, reusable component | 3 | Q2 |
| **S3.** Installable app manifest, service worker, and offline indicator | 8 | Q3 |
| **S4.** Offline data-entry queue with reliable sync-on-reconnect | 13 | Q3 |
| **S5.** Mobile "swipe to complete" interaction on job slots | 3 | Q3 |

**Task detail:**
- S1: build camera/gallery capture with categorization and geotagging, uploading to secure storage.
- S2: promote signature capture into a shared component reused across every surface that needs it.
- S3: add an installable-app manifest, service worker, and a clear offline/online indicator.
- S4: build a reliable offline queue for field data entry with conflict-safe sync when connectivity returns.
- S5: add a swipe-to-complete mobile interaction for job/task slots.

---

### E13 — Materials, Vendor & Job Costing (34 pts)

| Story | Points | Quarter |
|---|---|---|
| **S1.** Vendor/supplier directory | 5 | Q3 |
| **S2.** Purchase-order tracking linked to jobs/quotes | 8 | Q3 |
| **S3.** Crew time tracking (clock in/out per job) | 8 | Q3 |
| **S4.** Job-cost rollup: estimated vs. actual labor and materials | 8 | Q3 |
| **S5.** Integration test coverage across purchase-order-to-cost-rollup flow | 5 | Q3 |

**Task detail:**
- S1: build a vendor/supplier directory with materials supplied and preferred-vendor status.
- S2: build purchase-order tracking linked to jobs/quotes with received/outstanding status.
- S3: build clock-in/clock-out time tracking per job for crews.
- S4: roll up estimated vs. actual labor and materials cost per job.
- S5: build integration test coverage spanning the full purchase-order-to-cost-rollup flow.

---

### E14 — Standards & Compliance Packs (18 pts)

| Story | Points | Quarter |
|---|---|---|
| **S1.** Support a "no default" state for standards on programs that don't require compliance evaluation | 5 | Q2 |
| **S2.** Author two additional installable standard-set packs | 8 | Q3 |
| **S3.** Admin UX for selecting/installing a standards pack per program | 5 | Q3 |

**Task detail:**
- S1: ensure a program with no compliance requirement doesn't inherit an unrelated default standard set.
- S2: author two more standard-set packs to prove the standards engine is reusable beyond its first program.
- S3: build an admin surface for browsing and installing a standards pack onto a program.

---

### E15 — Accessibility & Design Polish (16 pts)

| Story | Points | Quarter |
|---|---|---|
| **S1.** Automated accessibility (axe-core) CI gate | 5 | Q2 |
| **S2.** Fix known field-navigation routing defect | 3 | Q1 |
| **S3.** Loading skeletons and standardized empty-state calls-to-action | 5 | Q3 |
| **S4.** Print stylesheets for quotes, invoices, and compliance documents | 3 | Q3 |

**Task detail:**
- S1: wire an automated accessibility check into CI, blocking regressions.
- S2: fix the known defect where multiple field-layout tabs route to the same destination.
- S3: add loading skeletons across list views and standardize empty-state calls-to-action.
- S4: add print-friendly stylesheets to the primary customer-facing documents.

---

### E16 — Legal, Security Review & Launch Gate (24 pts)

*The final gate before General Availability; deliberately scheduled last so it reviews
the system as it will actually ship.*

| Story | Points | Quarter |
|---|---|---|
| **S1.** Legal content finalization (Terms, DPA, effective dates) | 5 | Q3 |
| **S2.** Full persona × route regression matrix expansion | 8 | Q3 |
| **S3.** OWASP Top-10 review and remediation pass | 8 | Q3 |
| **S4.** Go/no-go launch readiness checklist and sign-off | 3 | Q3 |

**Task detail:**
- S1: finalize counsel-approved legal copy and wire it into the product.
- S2: expand automated end-to-end coverage across every role and every primary route.
- S3: conduct a full OWASP Top-10 review; remediate findings.
- S4: run the formal go/no-go readiness review against the launch checklist.

---

## 7. Sprint Capacity & Staffing Recommendation

### 7.1 Required velocity

| Quarter | Points | Sprints | Required pts/sprint |
|---|---|---|---|
| Q1 | 155 | 6 | ~26 |
| Q2 | 166 | 6 | ~28 |
| Q3 | 176 | 6 | ~29 |

### 7.2 Recommended core delivery team (engineering + QA, headcount asks)

Using the Lead QA Engineer's conservative sustained-velocity guidance (~8–9 points per
engineering FTE per sprint) plus a **~20% planning buffer** for unplanned work, code
review load, and the inevitable defect discovery that comes from expanding test
coverage:

| Quarter | Engineering FTE | QA FTE | Platform/DevOps FTE | Notes |
|---|---|---|---|---|
| Q1 | 4 | 1.5 | 0.5 (fractional) | Security, payments, and generalization work run in parallel; DevOps support is lightweight until the production-infrastructure epic ramps in Q3. |
| Q2 | 5 | 2 | 0.5 (fractional) | Heaviest quarter by point volume and by number of parallel workstreams (estimating, dispatch, notifications, reporting, portal completeness). |
| Q3 | 5 | 2 | 1.0 (full-time) | Production cutover, offline/mobile depth, and the launch-gate regression/security pass need dedicated platform and QA capacity. |

This does **not** include the Director of Engineering (oversight, not counted against
velocity) or Product/Project/Program Management headcount, which is assumed to already
be in place as the audience of this document.

### 7.3 What the buffer is for

The ~20% capacity margin above the raw required velocity is a deliberate planning
buffer, not slack available for additional scope. It exists to absorb:
- Defects surfaced by expanding automated test coverage (expected, not a sign of
  low-quality estimates).
- Onboarding/ramp time if headcount changes mid-quarter.
- Normal sprint variance (holidays, on-call, cross-team support requests).

---

## 8. QA Risk & Confidence Assessment

The Lead QA Engineer's review flags the following confidence levels on the estimates
above. This is intended to help Program Management understand where a quarter's
schedule is most likely to slip, and where contingency should be held if scope must be
trimmed.

| Confidence | Epics / Stories | Rationale |
|---|---|---|
| **Lower confidence — build in contingency** | E02 (payment provider integration correctness, webhook idempotency); E07-S3 (quote-builder backward compatibility); E12-S4 (offline sync queue); E16-S3 (OWASP remediation scope) | These carry either external-system dependency risk, backward-compatibility risk, or open-ended remediation scope that can only be sized precisely once findings are in hand. |
| **Medium confidence** | E08 (scheduling conflict detection); E13-S4 (job-cost rollup accuracy); E09 (tenant isolation for a new external role) | Well-understood problem shapes, but each is new surface area with meaningful edge-case testing needed. |
| **High confidence** | E03 (security hardening), E04 (data layer), E05 (observability), E15 (accessibility) | Well-precedented patterns already used elsewhere in the platform; primarily execution risk, not design risk. |

**Recommendation:** hold the Section 7 buffer explicitly against the lower-confidence
line items above rather than treating it as generally available capacity. If a quarter's
scope must be trimmed to fit a fixed team size, trim from the medium/lower-confidence
items first and protect the security, payments-core, and data-integrity stories, which
are launch-blocking regardless of sequencing.

---

## 9. Go-to-Market Milestones and Exit Criteria

| Quarter | Exit criteria |
|---|---|
| **Q1** | A second program runs end-to-end on admin configuration alone; online payments work in test mode; CSRF/MFA-policy/session/brute-force protections are live; numbering and indexing correctness fixes are shipped. **Ready for expanded design-partner use.** |
| **Q2** | Estimating/price book, scheduling/dispatch, notifications, reporting, and owner/subcontractor portal completeness are live; the generalized external-stakeholder portal pattern exists. **Ready for broader beta across multiple trades.** |
| **Q3** | Materials/vendor/time-tracking/job-costing are live; field offline capability ships; additional standards packs are installed and proven; legal content is finalized; full regression and OWASP review are complete. **General Availability.** |

---

## 10. Summary Ask

| Item | Ask |
|---|---|
| Total scope | 497 story points / 83 stories across 16 epics |
| Timeline | 3 quarters (18 two-week sprints) |
| Peak team size | 5 engineering FTE + 2 QA FTE + 1 platform/DevOps FTE (Q3) |
| Ramp | Start at 4 engineering FTE / 1.5 QA in Q1; grow to peak by Q3 |
| Contingency | ~20% capacity buffer per quarter, held against the lower-confidence items in Section 8 |
| Outcome | General Availability launch readiness at the end of Q3 |

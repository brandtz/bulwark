# Bulwark — Phase 1 Hardening Plan (Launch-Ready Pass)

> **Status**: Living plan. Owned by the agentic team; reviewed by the human sponsor (Matthew).
> **Created**: 2026-05-14
> **Driver**: Sponsor mandate "really critically examine every screen and feature… any menu option should be editable in Admin Settings… flows should maintain state… enhance and harden the entire project."
> **Scope class**: **AGGRESSIVE — best-in-class parity** (ServiceTitan + Jobber + Buildertrend + CompanyCam + EagleView benchmark).
> **Demo**: FROZEN per ADR-0011. Nothing in this plan touches `/demo`.

---

## 0. Pinning the directives (sponsor sign-off in this conversation)

| # | Directive | Constraint imposed |
|---|---|---|
| D-H1 | **Aggressive scope** | Launch-ready + competitive table-stakes + selected best-in-class patterns. No "polish only." |
| D-H2 | **Admin controls EVERYTHING — including UI labels** | All taxonomies, statuses, thresholds, templates, SLAs, AND user-facing copy editable per tenant (CMS-style label registry). |
| D-H3 | **No more mocks at runtime** | Flip `BULWARK_BACKEND` default from `mock` to `real`. Mock services retained for unit/integration tests ONLY. Every domain on real Postgres + Drizzle. |
| D-H4 | **GC-extensible, not wildfire-only** | Re-cast the domain: Bulwark is a **general contractor field-service platform** that ships with a **Wildfire Retrofit program** as the inaugural inspection program. Any GC upgrade (roofing, siding, kitchen, bath, decks, additions, solar, electrical, plumbing) must be expressible without code changes. |
| D-H5 | **Cross-feature state continuity** | Property/quote/WO/invoice/compliance/assessment are a connected graph. Status auto-transitions. Bi-directional navigation. Header rollups everywhere. |
| D-H6 | **Concurrency / oversight** | I orchestrate; subagents execute. Waves of 4–6 parallel. I review each wave before launching the next. |
| D-H7 | **Demo frozen** | `/demo` untouched. |

These are non-negotiable through this plan. ADRs at the end of this doc formalize them.

---

## 1. Audit findings summary (six parallel audits — see `/agents/audits/` for full reports)

| Audit lens | Bottom line | Headline gaps |
|---|---|---|
| Property + Assessment | 5/10 — minimal model | No structural detail, no zones model, no photos, no measurements, no timeline, wireframe drift ~70% |
| Quotes / WO / Invoices | 6/10 — solid math, broken continuity | Statuses don't auto-transition, no bi-dir nav, no change orders, no partial payments, no retainage, no schedule fields |
| Admin Config Hub | 5/10 — 50% complete | All statuses + trades + templates + numbering + tax + markup are hardcoded enums with read-only "viewer" pages |
| Auth / Tenancy | 7/10 — strong firewall, weak posture | No 2FA, no session timeout, no brute-force lockout, no auth audit, no email verification, no granular permissions |
| Design System / Mobile / a11y | 7/10 — primitives shipped, polish gaps | Icon placeholders, no skeletons on lists, no print styles, no reduced-motion, no real photo capture, no signature pad reuse |
| Cross-cutting parity | 4/10 — missing the platform layer | No notifications system, no dispatch board, no global search, no reporting, no email/SMS, no PWA, no error monitoring |

**Combined launch score: 5.7/10.** Acceptable as MVP-for-Drew. Unacceptable for "launch-ready" per directive D-H1.

---

## 2. The architectural pivots (these reshape several epics)

### Pivot P1 — Domain generalization: GC-first, Wildfire-as-program

**Today**: contracts, statuses, evaluator, and copy are wildfire/Oregon-specific (`OREGON_DEFAULT_STANDARDS`, "defensible space", "fire compliance doc").

**Target model**:

```
Organization
  └── enabled Programs[]            # "Wildfire Retrofit" | "Roof Replacement" | "Kitchen Remodel" | …
       ├── InspectionTemplate       # what to capture (was "Assessment")
       ├── StandardSet              # rules to evaluate compliance (was "OREGON_DEFAULT_STANDARDS")
       ├── ComplianceDocTemplate    # what to render
       ├── DefaultTradeSlots        # WO scaffolding
       └── Pricing defaults         # markup/tax/expiry hints
```

- Rename "compliance" → **"specification"** at the data layer; "compliance" survives as the wildfire-program word in copy.
- "Assessment" → **"Inspection"** (assessment kept as alias in code for backward compat).
- Wildfire is the only program shipped seeded. New programs are admin-pluggable (templates + standards + rules JSON).
- Property gains `programIds[]` (a property can be in multiple programs at once — e.g. wildfire retrofit + roof replacement).

**Why now**: doing this before E12/E13 / phase-2 wiring is 10x cheaper than after. The schema needs a `program_id` column on inspections, standards, compliance_docs, quotes (optional), and work_orders (optional).

### Pivot P2 — CMS label registry (D-H2)

Every user-facing string that an admin might want to rename (status names, trade names, role labels, button copy on a few high-stakes flows, doc footer text, email subject lines) lives in a `labels` table keyed by `(organizationId, namespace, key, locale)`. A `useLabel('status.property.lead', 'Lead')` composable returns the override or the default.

**Scope (not infinite)**:
- ✅ Status labels (property/quote/WO/invoice/compliance/job).
- ✅ Trade labels.
- ✅ Role display names.
- ✅ Program copy (program name, intake CTA, compliance-doc title, etc).
- ✅ Email + SMS template subjects/bodies (already promised in E9).
- ✅ Branded copy on PDFs (org name, license footer, declarations).
- ❌ Not every inline microcopy in every page — that's a maintenance nightmare. Lint rule enforces: hardcoded strings are fine; only strings tagged with `useLabel()` are CMS-editable.

### Pivot P3 — Real backend default (D-H3)

- Flip `nuxt.config.ts` default to `BULWARK_BACKEND=real`.
- Finish missing real services (audit any gaps vs. the contract barrel).
- Convert fixture data into seed scripts under `scripts/db-seed/` keyed by program (`wildfire-demo.ts` ships seeded).
- Mock services retained ONLY for `tests/unit/` + `tests/integration/`. Playwright runs against real DB by default; reseed-between-spec already wired in `tests/e2e/_reseed.ts`.
- CI adds a `BULWARK_BACKEND=real` job alongside the existing mock job until all specs are stable; then mock CI job is retired.
- New `__resetMockServicesForTests` becomes the ONLY surface that touches mocks in app code paths.

### Pivot P4 — State continuity layer

Introduce a thin domain-event bus (`shared/events/`) — synchronous in v1, pub/sub-shaped so we can move it to pg-boss in v2. Domain mutations emit events; subscribers (status engine, audit, future notifications) react.

```
quote.accepted     → property.transitionTo('accepted'),     audit, notify
workOrder.created  → property.transitionTo('in_progress'),  audit, notify
workOrder.completed→ complianceDoc.checkEligible,           audit
invoice.markedPaid → property.transitionTo('paid'),         audit, notify
quote.rejected     → property.transitionTo('on_hold'),      audit
```

Status pipeline is tenant-configurable (per D-H2); the engine reads the tenant's `statusPipeline` config and ignores transitions that point to a status the tenant has disabled.

### Pivot P5 — Property hierarchy

Today: 1 property = 1 address = 1 client. Insufficient for multi-building sites, multi-unit, commercial portfolios, or a homeowner with multiple properties.

Target (Phase 1 minimum):
```
Client
  └── Property (physical site, address, parcel)
       ├── Buildings[]           # ≥1; defaults to a single "Main" building on intake
       │    └── Sections[]       # roof faces / elevations / rooms — optional, per program
       └── Contacts[]            # owner, occupant, billing, adjuster — supersedes single clientId
```

We **do not** ship a full multi-site CRM upgrade in Phase 1. We ship the schema + property detail UI that shows a single default building so the door is open. Subagents add `buildings` + `contacts` tables but the intake form stays one-screen; the building/section editor is collapsed by default.

---

## 3. Hardening epic catalog

These replace/extend the existing epic catalog. Existing E1–E11 work is NOT thrown away — these are addenda. New net-new epics get E15+ IDs.

| ID | Name | Type | Drives |
|---|---|---|---|
| **EH-A** | **Domain Generalization & Program Model** | Net-new (E15) | Pivot P1. Required before everything else. |
| **EH-B** | **CMS Label Registry & Branding** | Net-new (E16) | Pivot P2. Foundation for D-H2. |
| **EH-C** | **Real-Backend Cutover & Seeding** | E11 closeout + addendum | Pivot P3. Kills mocks. |
| **EH-D** | **State Continuity Engine & Pipeline Editor** | E9 + E3 + E5 + E6 + E8 addendum | Pivot P4 + D-H5. Editable status pipeline. Auto-transitions. Bi-dir nav. |
| **EH-E** | **Property Depth + Hierarchy** | E3 addendum | Pivot P5. Structural fields, buildings, contacts, photos schema, parcel lookup, timeline. |
| **EH-F** | **Inspection Template Engine** | E4 addendum + E9 | Replaces hardcoded wildfire form. Admin defines fields per program. Conditional fields, required flags, dynamic Zod. |
| **EH-G** | **Quote / WO / Invoice Depth** | E5 + E6 + E8 addendum | Tiers, change orders, partial payments, retainage, deposits, schedule fields, cost baseline, expiry enforcement, rejection reason. |
| **EH-H** | **Admin Config Hub Buildout** | E9 addendum | Make every read-only stub functional: company branding editor, user invite/role/deactivate, workflow editor, trades/materials catalog, templates editor, numbering, providers, webhooks, feature-flag mutator, notification prefs. |
| **EH-I** | **Auth & Security Hardening** | E2 addendum | Session timeout, idle lockout, brute-force protection, password strength, audit auth events, 2FA scaffold (TOTP), impersonate-for-support, granular permissions matrix. |
| **EH-J** | **Notifications System** | Net-new (E17) | Notification center, per-user prefs, email (Resend), SMS (Twilio) scaffolds, template editor, real-time toast persistence in audit. |
| **EH-K** | **Reporting & Dashboards** | E3 addendum (admin dash) | Admin KPI cards (YTD revenue, AR, jobs/month, conversion %), AR aging, conversion funnel, job-cost dashboard, scheduled email reports scaffold. |
| **EH-L** | **Design System Polish & a11y** | E1 addendum | Icon set (proper SVG sprite), loading skeletons on every list, print stylesheets, reduced-motion, modal focus mgmt, dark-mode tokens (deferred), empty-state CTA standardization, BulwarkSignaturePad as a primitive. |
| **EH-M** | **Field / Mobile Depth + PWA** | E10 addendum | Photo capture (R2 upload), signature reuse, offline indicator + PWA manifest, dispatch-aware "my jobs today," GPS check-in scaffold, swipe-to-complete on WO slots. |
| **EH-N** | **Sub Portal Real-Backend (E12)** | E12 execution | Magic-link auth, "my jobs," accept/decline, photo upload, COI tracking. |
| **EH-O** | **Homeowner Portal Real-Backend (E13)** | E13 execution | Magic-link auth, project timeline, document library, invoice payment (Stripe). |
| **EH-P** | **Search, Saved Views, Bulk Actions** | Cross-cutting | Topbar global search (Cmd+K), saved filter views per entity, multi-select bulk actions on properties/quotes/WOs. |
| **EH-Q** | **Observability & Operational Polish** | Cross-cutting | Sentry error monitoring, request logging, rate limiting on auth endpoints, money-format lint, soft-delete enforcement, persona × route Playwright matrix expansion. |

---

## 4. Execution sequencing (wave plan)

Subagents execute each wave in parallel. I review wave output before launching the next. Each subagent owns a vertical slice end-to-end including Playwright coverage per ADR-0007.

### Wave 1 — Foundations (parallel ×5)

| # | Subagent | Owns |
|---|---|---|
| W1-1 | **Domain Generalizer** | EH-A: program model, schema additions (`programs`, `program_memberships`), rename inspection terminology in code (assessment→inspection alias), seed Wildfire Retrofit program with the existing standards/templates. |
| W1-2 | **Label Registry & Branding** | EH-B: `labels` table, `useLabel()` composable, settings page `/settings/labels` (grouped by namespace), branding (logo/primary color/footer) editor on `/settings/company`. Pilot label-overrides on status badges + trade labels. |
| W1-3 | **Admin Config Hub Buildout — Part A** | EH-H (taxonomies half): Status pipeline editor (reorder/rename/recolor/disable). Trade catalog editor. Materials catalog editor. Numbering rules editor. Tax/markup/expiry defaults editor. |
| W1-4 | **State Continuity & Pipeline Wiring** | EH-D: domain event bus, auto-status transitions on quote/WO/invoice mutations, bi-directional links across all detail pages, tab badge counts + header rollups on property detail. |
| W1-5 | **Real-Backend Cutover** | EH-C: flip default backend to `real`, finish any missing real services (audit `services.ts` contract barrel against `server/services/*.real.ts`), seed scripts, retire mock CI lane, update test helpers. |

### Wave 2 — Domain depth + admin breadth (parallel ×6)

| # | Subagent | Owns |
|---|---|---|
| W2-1 | **Property Depth** | EH-E: structural fields (year built, lot, sqft, stories, parcel, hazards), buildings + sections schema, contacts (multi), photos schema (no capture yet — that's W3-3), activity timeline tab, parcel lookup scaffold (admin-toggleable). |
| W2-2 | **Inspection Template Engine** | EH-F: dynamic field registry (text/select/boolean/number/date/photo), conditional visibility, per-program template versioning, evaluator reads the template + standard set, replaces hardcoded wildfire form with a generated form. Adds zone subsection capability. |
| W2-3 | **Quote / WO / Invoice Depth** | EH-G: tiered quotes (Good/Better/Best), optional line items, deposits, payment plans, change-order entity, retainage, partial payments array, schedule fields on WO, cost baseline carryover, rejection reason, expiry enforcement, per-line discount, per-line notes. |
| W2-4 | **Admin Config Hub Buildout — Part B** | EH-H (rest): user invite/role/deactivate/transfer-ownership, feature-flag mutator, providers config (email/SMS/storage), webhooks, audit-log filters + export, /profile/notifications. |
| W2-5 | **Auth Hardening** | EH-I: session timeout + idle lockout, brute-force lockout, password strength + breach check (HIBP), audit auth events, 2FA TOTP scaffold + backup codes, impersonate-for-support, granular permission matrix groundwork. |
| W2-6 | **Design System Polish + Signature Primitive** | EH-L: icon SVG sprite, loading skeletons everywhere, print stylesheets for quotes/invoices/compliance, reduced-motion, modal focus trap, BulwarkSignaturePad promoted to ui/, EmptyState CTA standardization, BulwarkJobCard adoption across admin/work-orders. |

### Wave 3 — Cross-cutting + portal scaffolds (parallel ×5)

| # | Subagent | Owns |
|---|---|---|
| W3-1 | **Notifications System** | EH-J: notification center page, real persistence via audit log, per-event subscriptions, Resend email scaffold, Twilio SMS scaffold, template editor backed by labels table, in-app toast persistence. |
| W3-2 | **Reporting & Dashboards** | EH-K: admin dashboard KPI cards backed by real queries, AR aging report, conversion funnel, job-cost view (estimated vs actual), CSV export. |
| W3-3 | **Field / Mobile Depth + PWA** | EH-M: photo capture component (camera + gallery + R2 upload + categorization + geotag), signature reuse from primitive, offline indicator + PWA manifest + service worker stub, dispatch-aware "my jobs today," swipe-to-complete on slots. |
| W3-4 | **Sub + Homeowner Portals scaffolds** | EH-N + EH-O: magic-link auth, sub dashboard / job list / accept-decline / COI upload, homeowner project timeline / doc library / invoice payment (Stripe test mode wired). |
| W3-5 | **Search + Saved Views + Bulk Actions + Observability** | EH-P + EH-Q: topbar global search (server endpoint over properties/clients/quotes/WOs/invoices), Cmd+K modal, saved view persistence per entity, multi-select bulk actions, Sentry integration, request logging middleware, rate limiting. |

### Wave 4 — Review, regression sweep, ADR ratification (me + 1 subagent)

- Per-wave acceptance checklist below.
- Full Playwright run on real backend; expected ≥ 200 specs by end of plan.
- Re-run audit on the result and produce a delta report.
- Land ADRs (see §6).

---

## 5. Definition of Done — per wave

A subagent's wave is "done" when **all** of the following are true for its slice:

1. **Contracts updated**: `shared/contracts/*.ts` reflects new shapes; Zod is the single source of truth.
2. **DB schema migration written**: `server/db/schema/*.ts` + `pnpm exec drizzle-kit generate` produces a clean migration.
3. **Real service updated FIRST** (D-H3). Mock service updated only insofar as it powers unit/integration tests.
4. **CMS labels respected** (D-H2): any new user-visible status/role/trade/program text goes through `useLabel()` or has a documented exception.
5. **Domain events emitted** where state changes (D-H5).
6. **Permission gated** (ADR-0006): every new admin surface declares `requiredRoles`.
7. **Playwright spec** covering happy path + ≥1 negative, running against real backend.
8. **No `BULWARK_BACKEND=mock`-only code paths** introduced in product code (tests are fine).
9. **Top-of-file rationale block** on every new file >40 LOC (ADR-0008).
10. **BUILD_STATUS.md** advanced; handoff note dropped in `agents/handoffs/`.
11. **Demo untouched** (ADR-0011).
12. **No new dependencies** without an inline ADR justifying.

A wave is "approved" by me when all above are true for every slice in that wave AND CI is green on the wave's PR branch.

---

## 6. New ADRs landing in this hardening pass

| ID | Title | Status |
|---|---|---|
| ADR-0013 | GC-first generalization: programs as plug-in inspection bundles | proposed in W1-1 |
| ADR-0014 | CMS label registry & branding overrides (`labels` table) | proposed in W1-2 |
| ADR-0015 | Mocks demoted to test-only; real backend is the runtime default | proposed in W1-5 |
| ADR-0016 | Status pipelines + trades as runtime-editable data | accepted in W1-3 |
| ADR-0017 | Domain event bus (synchronous v1, pg-boss-ready) | accepted in W1-4 |
| ADR-0018 | Property hierarchy: buildings + sections + multi-contact | proposed in W2-1 |
| ADR-0019 | Inspection templates as data, not code | proposed in W2-2 |
| ADR-0019 | Granular permission matrix (role bundles preserved; permission rows authoritative) | proposed in W2-5 |
| ADR-0020 | Notification subscriptions per (user, event) — channels independent | proposed in W3-1 |
| ADR-0021 | Magic-link auth for sub + homeowner portals | proposed in W3-4 |
| ADR-0022 | Sentry + request logging + rate limiting baseline | proposed in W3-5 |

Each ADR is authored by the subagent that proposes it and reviewed by me at wave acceptance.

---

## 7. Out of scope (explicit)

These are tempting but **not** in this hardening pass — Phase 2+ candidates:

- Full visual dispatch board with sub-availability calendar (W2-3 ships schedule fields only).
- Full route optimization / GPS turn-by-turn.
- Photo annotation / mark-up tools (W3-3 captures + categorizes only).
- EagleView / CompanyCam API ingestion (schema slots reserved; integrations deferred).
- QuickBooks / Xero financial sync.
- Multi-currency (cents-only, USD-only Phase 1).
- Drip campaigns / marketing automation.
- Mechanics lien tracking.
- 1099 reporting.
- Sales-tax-by-jurisdiction (single org tax rate Phase 1).
- Real-time multi-user presence (Yjs etc).
- White-label custom domains.

If a subagent encounters one of these, it stubs the surface honestly and logs an ADR.

---

## 8. Risk register (live)

| Risk | Mitigation |
|---|---|
| Domain rename breaks ~70% of contracts/tests in one go | W1-1 introduces "Inspection" as an alias; "Assessment" terms stay valid for the existing pages until W2-2 ships. Mass rename happens in a single dedicated PR per wave. |
| Real-backend cutover breaks Playwright timing | reseed already wired; W1-5 retains the mock CI lane until wave 2 acceptance. |
| Label registry tempts subagents to over-CMS-ify (every microcopy) | Lint rule + explicit allowlist in EH-B. Each wave has a hard cap of <40 new `useLabel()` keys. |
| Program model bleeds into Phase 2 portals (E12/E13) | W3-4 scaffolds portals AFTER W1-1 lands; they consume `programIds` from day one. |
| Sponsor demo path (intake → assessment → compliance → invoice) regresses | A dedicated "smoke" spec (`tests/e2e/happy-path-launch.spec.ts`) runs at the top of every CI job. Any wave that breaks it is rolled back. |
| Subagent drift produces inconsistent UI patterns | I review wave output against EH-L design-system polish standard. Wave 2 design-polish slice rebases everyone onto the same primitives. |

---

## 9. Per-epic addenda

Each existing epic gains a hardening addendum file in `agents/epics/EXX-hardening.md`. Net-new epics live at `agents/epics/E15+`. The first batch is authored by a planning subagent in parallel with Wave 1 — see §10.

---

## 10. Live execution log

This section is appended to by every wave acceptance. Entries are reverse-chronological.

### 2026-05-14 — Plan authored

PHASE1_HARDENING_PLAN.md drafted by orchestrator. Six parallel audits complete; reports archived in `agents/audits/`. Wave 1 dispatched.

---

*— end of plan —*

# Bulwark → General Contractor Platform: Capability Read-Out & Market Assessment

> **Purpose:** a single, detailed reference for the decision to generalize Bulwark from
> a *wildfire-retrofit-specific* operations tool into a *full-lifecycle platform for any
> contractor work*. Covers: what's actually built today, what's still wildfire-coupled,
> what's missing entirely, the addressable market at each altitude, and a concrete
> feature/architecture roadmap.
> **Compiled:** 2026-09-10, from direct source inspection of `bulwark/` (contracts,
> services, schema, pages) cross-referenced against `BUILD_PLAN.md`, `BUILD_STATUS.md`,
> `PRODUCTION_GAP_REGISTER.md`, `PHASE1_HARDENING_PLAN.md`, and the two business-context
> docs (`BULWARK_BRD.md`, `BULWARK_BUSINESS_CONTEXT.md`).
> **Bottom line up front:** this codebase already went through one generalization pass
> (the "GC-first, wildfire-as-program" pivot, directive D-H4, executed Wave 1 of
> `PHASE1_HARDENING_PLAN.md`). The plumbing for a program-agnostic platform — programs,
> trades, inspection templates, status pipelines, a label/CMS registry, buildings/
> sections, contacts — **exists and works**. What's still wildfire-specific is mostly
> **seed data, copy, and a handful of hardcoded field-evaluator slugs** — not the core
> architecture. The bigger gap for "full lifecycle for any contractor work" is **breadth
> of business features** (estimating/price-book, scheduling/dispatch, materials/vendor
> management, payments, time tracking) that every general contractor needs regardless of
> the compliance narrative, and that a wildfire-only MVP never needed.

---

## 1. Executive Summary

Bulwark was conceived as *"the operating system for a wildfire-hardening retrofit GC in
Eastern Oregon."* Over the course of prior build waves, the team already recognized this
was too narrow and executed a first generalization pass: the domain model was
re-architected around a **`Program`** concept (Wildfire Retrofit is now *one* seeded
program, not the only possible one), with admin-configurable **trades**, **inspection
templates**, **status pipelines**, and a **CMS label registry** so that copy, taxonomy,
and workflow shape are tenant data, not code.

That means the honest current state is **not** "wildfire-hardcoded monolith that needs a
rewrite." It's **"program-agnostic engine with one program installed, wearing wildfire
branding, missing several business-critical modules that apply to all contracting work
(estimating, scheduling, materials, payments) because the first customer didn't need them
yet."**

Two separate tracks of work are needed to hit "full lifecycle for any contractor work":

1. **Finish de-wildfiring what's left** (naming, seed data, evaluator slugs, marketing
   copy, demo) — this is finishing work already 70% done, not a new initiative.
2. **Build the general-contractor feature set that has nothing to do with compliance**
   (price book/estimating, scheduling & dispatch, materials & vendor/PO management,
   time tracking, online payments, reporting) — this is genuinely new scope, and it's
   also exactly what the current `BUILD_PLAN.md` (L-series) mostly does **not** cover,
   because that plan optimizes for shipping the *first wildfire customer*, not a
   horizontal product.

The addressable market shifts an order of magnitude between these two framings — from a
geographically concentrated, regulation-driven niche (a few thousand potential jobs/year
across four states) to the general field-service/job-management SaaS category
(ServiceTitan / Jobber / Buildertrend / JobNimbus territory, tens of billions in TAM) —
but Bulwark's actual defensible wedge, the **compliance/documentation package
engine**, is *most* valuable in verticals that share wildfire retrofit's shape:
regulatory urgency + insurer/inspector-facing paperwork. Section 6 lays this out in
detail; the short version is **don't go generic-horizontal against ServiceTitan — go
broad across "compliance-and-inspection-heavy trades"** where the documentation engine
is the moat, and treat pure job-management (scheduling, price book, payments) as
table-stakes you must build but that isn't the differentiator.

---

## 2. What Bulwark Actually Is Today (Verified Capability Inventory)

### 2.1 Architecture snapshot

| Layer | Choice | Notes |
|---|---|---|
| Framework | Nuxt 3 (Vue 3, SSR+SPA), Nitro server routes | File-based API + pages |
| Language | TypeScript strict, end-to-end | Zod is the single source of truth for shapes |
| DB | PostgreSQL + Drizzle ORM | Multi-tenant, shared-schema, `organizationId` on every tenant table |
| Auth | Session cookies (`nuxt-auth-utils`) + JOSE JWT + API keys | Single active org per session (`activeOrganizationId`) |
| Jobs | pg-boss (Postgres-backed queue) | PDF rendering, comms, scheduled sweeps |
| Storage | Pluggable driver (filesystem dev/test, R2 prod) | Presign → PUT → finalize pattern |
| Testing | Vitest (453 unit/integration) + Playwright (~190 e2e) | Real-backend e2e is the default target |
| Deployment target | Vercel (web) + Render (worker/cron) + Neon/Render Postgres | Not yet cut over to managed Postgres |

**Tenant firewall:** every org-scoped service method calls `assertSameTenant(resolver,
organizationId)`. One org per session; users can hold memberships in multiple orgs but
only one is active per request. This is solid and proven (property-scoped homeowner
role already uses the pattern L15/insurer will need).

### 2.2 Core domain model — what exists right now

This is the real, current entity graph (Drizzle schema + service + contract all present
for each):

```
Organization
 ├─ Users, Memberships, Roles (super_admin / org_admin / org_manager / field /
 │    sub_contractor / homeowner) — 7 roles total (grep-verified against RoleSchema)
 ├─ Programs[]  ←── the generalization seam (see 2.3)
 │    ├─ InspectionTemplate (sections → fields, dynamic, versioned)
 │    ├─ StandardSet (evaluator rules → compliance issues)
 │    ├─ ComplianceDocTemplate (declaration/footer copy, branding)
 │    ├─ DefaultTradeSlots
 │    └─ PricingDefaults (markup/tax/quote-expiry)
 ├─ Trades[] (org-customizable catalog: rename/recolor/reorder/add custom)
 ├─ StatusPipelines[] (per entityType: property/quote/work_order/invoice/
 │    compliance/job — versioned, admin-editable graph of legal transitions)
 ├─ Labels[] (CMS overrides: status/trade/role/program copy, per org)
 ├─ Clients
 ├─ Properties
 │    ├─ Buildings[] (house/ADU/garage/barn/shop; year built, sqft, construction)
 │    │    └─ Sections[] (rooms, exterior faces, decks, roof — reorderable)
 │    ├─ Contacts[] (owner/occupant/billing/adjuster — supersedes single clientId)
 │    ├─ ProgramMemberships[] (a property can be enrolled in >1 program at once)
 │    ├─ Photos, Attachments
 │    └─ Inspections (was "Assessments") → InspectionResponses (dynamic per template)
 ├─ Quotes (line items, tiers: good/better/best/custom, markup/tax, PDF export)
 ├─ ChangeOrders (linked to work orders)
 ├─ WorkOrders (per-trade slots, assigned subs, schedule fields)
 ├─ Subcontractors (+ COI docs, trades[])
 ├─ ComplianceDocs (async-generated PDF, signature capture, branding)
 ├─ Invoices → InvoicePayments (manual ledger; no Stripe yet)
 ├─ Notifications + NotificationSubscriptions
 ├─ AuditLog (every tenant write, immutable)
 ├─ SavedViews, Search (global)
 ├─ Jobs (pg-boss async queue: PDF render, comms, purge, COI-expiry scan)
 ├─ Webhooks, ApiKeys, ProviderConfigs (email/SMS/storage secrets, sealed at rest)
 └─ FeatureFlags
```

### 2.3 The generalization scaffolding that's *already built*

This directly answers "what have we built toward being generic":

| Mechanism | What it does | Status |
|---|---|---|
| **`Program`** entity (`shared/contracts/program.ts`) | Unit of GC work. Owns an inspection template, a standard set, a compliance-doc template, default trade slots, pricing defaults. `kind` is `inspection_program` \| `service_program` — i.e. the model already anticipates work that has *no* compliance/inspection step at all (a pure remodel or service call). | ✅ Built (contract, DB table, real service, admin CRUD at `/settings/programs`) |
| **Inspection Template Engine** (`shared/contracts/inspection-template.ts`) | Admin-defined field trees (section → field), 12 field kinds (text/number/currency/boolean/select/multiselect/date/photo/signature/passfail/rating), conditional visibility, versioning, an extensible evaluator-rule union. Replaces the hardcoded wildfire assessment form. | ✅ Built. Wildfire's own template is now just data (`shared/inspection-templates/wildfire-defaults.ts`) expressed through this engine — proof the engine is real, not aspirational. |
| **Trades catalog** (`shared/contracts/trade.ts`) | Org-scoped, renameable/recolorable/reorderable trades; supports custom trades beyond the 6 built-ins. | ✅ Built (contract + service + `/settings/trades`), **but** WO trade slots and Subcontractor `trades[]` JSONB are still constrained by the frozen `TradeSchema` Zod enum (6 wildfire-era slugs) — the catalog exists but isn't yet the sole source of truth everywhere it's consumed. |
| **Status Pipelines** (`shared/contracts/status-pipeline.ts`) | Per-tenant, per-entity-type, versioned graphs of legal status transitions; slugs/labels/colors admin-editable; historical versions retained for audit. | ✅ Built (contract + service + `/settings/pipelines`), but the underlying `PropertyStatusSchema` etc. Zod enums still hardcode wildfire-flavored slugs (`compliance_pending`, `compliance_complete`) as the "seed universe." |
| **Label/CMS registry** (`labels` table + `useLabel()`) | Every status/trade/role/program string, plus PDF declaration/footer copy, is overridable per org without a deploy. | ✅ Built, scoped deliberately (not every microcopy — see `PHASE1_HARDENING_PLAN.md` Pivot P2). |
| **Buildings + Sections + multi-Contact** | Properties aren't single-address/single-owner anymore; supports ADUs, multi-building sites, and owner/occupant/billing/adjuster contact roles. | ✅ Built (schema + service), UI defaults to one "Main" building so intake stays fast. |
| **Program ↔ entity membership** | `program_memberships` joins programs to property/quote/work_order — a property can run a wildfire program **and** a roofing program simultaneously. | ✅ Built. |

**What this means:** the hard architectural work of "don't hardcode one vertical" is
largely done. A second program (e.g., "Roof Replacement," "Kitchen Remodel," "Storm
Restoration") could, in principle, be stood up **today** via `/settings/programs` +
`/settings/inspection-templates` + `/settings/standards` + `/settings/trades` without a
code change — that claim has never actually been exercised (only Wildfire Retrofit has
ever been seeded), which is the single most important thing to validate first (see §5.1).

### 2.4 Role portals built

| Portal | Routes | Depth |
|---|---|---|
| Admin (super_admin/org_admin/org_manager) | `/admin/**` — pipeline, clients, properties, quotes, work-orders, invoices, subcontractors, compliance, reports, dispatch | Deepest surface; ~20 settings sub-pages |
| Field | `/field/**` — dashboard, check-in, assessments, work-orders, properties, jobs, sync-queue | Mobile-first PWA-leaning, but true offline/PWA not finished |
| Subcontractor | `/sub/**` — dashboard, work-orders, quotes, cois, profile, settings | Real-backend but shallow detail views (gap §3.10.6) |
| Homeowner | `/homeowner/**` — properties, quotes, invoices | Real-backend but several detail views are empty-state placeholders (gap §3.10.5) |
| Insurer (planned, not built) | none yet | ADR-0004 written; `insurance_representative` role does not exist in `RoleSchema` or DB enum yet |

### 2.5 Engineering/quality posture

- **Testing discipline is genuinely strong**: 453 unit/integration tests, ~190 e2e
  specs, contract-first (Zod) development, mock+real service parity enforced per story.
- **Security baseline**: tenant firewall, sealed provider secrets (AES-256-GCM),
  presign→finalize upload pattern with known TOCTOU caveat, soft deletes everywhere,
  audit log on every write. Still missing: CSRF tokens, org-level MFA enforcement policy,
  automated SAST/dependency scanning, session idle timeout, brute-force lockout.
- **Money handling**: integer cents throughout, never float — correctly followed.
- **Documentation discipline**: ADRs, epics, a gap register, and a lessons-learned habit
  are all real and current — this is unusually well-organized for a project this size,
  which materially de-risks continuing to build on it rather than rewriting.

---

## 3. What's Still Wildfire-Specific (the "finish de-wildfiring" list)

This is concrete, cited, and mostly small/mechanical — **not** a re-architecture:

| # | Where | What's coupled | Fix effort |
|---|---|---|---|
| 1 | `shared/utils/compliance.ts` | `OREGON_DEFAULT_STANDARDS` is the fallback standards row for any org that hasn't customized (`standards.mock.ts`, `standards.real.ts` both fall back to it). | Low — ship additional standard-set seeds per program/vertical; make "no default" an explicit, empty-but-valid state for non-compliance programs. |
| 2 | `shared/inspection-templates/wildfire-defaults.ts` | The *only* seeded inspection template. Its field slugs (`roof_material`, `siding_material`, `eave_type`, `vent_type`, `defensible_space_cleared`) are hardwired into the legacy evaluator too. | Low/Medium — author 2-3 more seed templates (proves the engine); the legacy hardcoded evaluator path should be fully retired in favor of the generic evaluator-rule engine (already built). |
| 3 | `shared/contracts/trade.ts`, `subcontractor.ts` | `TradeSchema` enum frozen to 6 wildfire trades (`roofing, siding, gutters, eaves_vents, defensible_space, general_labor`); WO slots + sub `trades[]` still validate against this enum, not the dynamic `trades` catalog. | Medium — widen WO/Sub JSONB validation to accept any active org trade slug; this is explicitly flagged as deferred in the trade.ts file header. |
| 4 | `shared/contracts/property.ts` | `PropertyStatusSchema` enum bakes in `compliance_pending` / `compliance_complete` as literal states, even though status pipelines are meant to be the runtime authority. | Low/Medium — confirm (via code, not just comment) that the pipeline rows, not the Zod enum, are actually authoritative at runtime; if the enum still gates validation, generalize the seed slugs (e.g., `deliverable_pending`/`deliverable_complete`) and let "compliance" be the wildfire program's own label. |
| 5 | `shared/contracts/compliance.ts`, `program.ts` field name `complianceDocTemplateId` | The **terminal artifact** of a program is modeled as "compliance doc" specifically — signature capture, declaration/footer copy, ORS/OAR references. A kitchen remodel doesn't produce a "compliance doc," it might produce a warranty certificate, a completion report, or nothing at all. | Medium — generalize to a `DocumentTemplate`/`DeliverableTemplate` concept with a `kind` (`compliance_package`, `completion_report`, `warranty_certificate`, `none`), and let Wildfire Retrofit be the program that happens to require `compliance_package`. |
| 6 | `app/pages/login.vue` | Marketing copy: *"The complete operations platform for wildfire retrofit contractors and property management."* | Trivial — copy change (make this a label too, or org-configurable tagline). |
| 7 | `app/pages/settings/programs.vue` | UI assumes/labels Wildfire Retrofit as the permanent, unremovable, top-sorted builtin program. | Low — fine to keep as the flagship seeded program; just don't let copy imply it's the *only* one. |
| 8 | `/demo/**` | Entire demo site (frozen per ADR-0011) is wildfire-only, role-based storytelling. | Not urgent — demo is explicitly out of scope for active work, but it *is* your sales artifact; needs its own follow-up once the pivot is real, since prospects outside wildfire retrofit will click through it. |
| 9 | Business docs | `BULWARK_BRD.md`, `BULWARK_BUSINESS_CONTEXT.md`, `docs/BULWARK_SCREENS_BY_ROLE.md` describe the business and screens exclusively in wildfire-retrofit terms (Tier 1/2/3 = roofing/siding/full hardening specifically). | Low — these need a rewrite pass once product direction is confirmed; low engineering cost, useful now for hiring/investor conversations. |

**Read:** none of this requires touching the tenancy model, the contract-first Zod
pattern, the program/inspection-template engine, or the status-pipeline engine. It's
seed data, a few frozen enums, terminal-document naming, and copy.

---

## 4. What's Missing Entirely (genuinely new scope)

Two different "missing" buckets matter here, and they should not be conflated:

### 4.1 Already-planned, not yet built (tracked in `BUILD_PLAN.md` L-series / gap register)

These are launch-hardening items for the *current* (still wildfire-framed) business,
not generalization work — but several of them are also foundational for any GC vertical:

| Item | Why it matters for GC-generalization too |
|---|---|
| **Stripe payments** (L14) | Every contracting business needs online invoice payment, not just wildfire retrofit. |
| **Insurer portal** (L15) | Modeled narrowly ("Insurance Company Representative"), but the *pattern* — a read-only, scoped, external-stakeholder portal — generalizes to lenders, property managers, HOAs, or referral partners in other verticals. Build it generically from the start. |
| **Notifications system** (EH-J / L03 addenda) | Universal need. |
| **Reporting & dashboards depth** (EH-K) | Universal need; currently a real but shallow renderer. |
| **Auth hardening** (L07/EH-I): CSRF, MFA policy, session timeout, brute-force lockout | Universal, security-critical regardless of vertical. |
| **Field PWA / offline / photo capture** (EH-M) | Universal for any on-site trade work. |
| **Managed Postgres, deploy runbook, legal content** (L16-L18) | Universal launch requirements. |

### 4.2 Not planned anywhere yet — true "full lifecycle for any contractor" gaps

These are the modules a horizontal contractor-ops platform needs that **wildfire retrofit
never surfaced as a requirement**, because a single-trade-composition, insurer-driven
niche business doesn't need them as urgently:

| Module | Why any GC needs it | Current state |
|---|---|---|
| **Estimating / price book (labor + materials catalog, assemblies, cost codes)** | Every contractor prices from a catalog, not free-typed line items every time. Quotes today are denormalized JSONB line items typed fresh each time — fine for 1 program, painful across dozens of trades/programs. | Not built. `quote.ts` explicitly rejected a line-item service/table (reasonable for MVP scale, wrong at horizontal-catalog scale). |
| **Scheduling & dispatch calendar** (crew calendar, drag-drop, conflict detection, sub availability) | Table stakes for ServiceTitan/Jobber-class tools; wildfire MVP has a `dispatch.vue` page and WO `schedule fields` but no real calendar/board. | `admin/dispatch.vue` exists but is shallow; `PHASE1_HARDENING_PLAN.md` explicitly deferred "full visual dispatch board with sub-availability calendar" to Phase 2+. |
| **Materials / vendor / purchase-order management** | Contracting profitability lives and dies on material cost tracking and vendor relationships; explicitly out of scope in the BRD (`Vendor/supplier management` is P1/Phase 2, never built). | Not built. |
| **Time tracking / crew clock-in-out, labor cost actuals** | Needed to know true job profitability across any trade. | Not built; no schema. |
| **Job costing (estimated vs. actual)** | `PHASE1_HARDENING_PLAN.md` flags a "job-cost dashboard" under EH-K reporting, not yet built. | Not built. |
| **Warranty / service-call tracking (post-completion)** | General contractors (esp. remodel/roofing) run warranty callbacks; wildfire retrofit's "compliance doc handoff" ends the relationship — a generalized platform needs a post-completion service-ticket loop. | Not built, not modeled. |
| **Multi-currency / sales-tax-by-jurisdiction** | Wildfire retrofit is single-state/single-tax-rate; any horizontal platform serving contractors nationally needs jurisdiction-aware tax. | Explicitly out of scope (`PHASE1_HARDENING_PLAN.md` §7). |
| **Lead-gen / marketing integrations (web forms, ad conversion tracking, review requests)** | Table stakes for Jobber/Housecall Pro-class competitors. | Not built; only internal CRM/pipeline exists. |
| **QuickBooks/Xero accounting sync** | Nearly universal integration ask from contracting businesses. | Explicitly out of scope. |
| **Insurance-claims/restoration workflow (Xactimate-style estimating, adjuster collaboration)** | If leaning into "compliance/insurer-adjacent trades" as the strategic wedge (§6), this specific workflow — not wildfire hardening, but storm/water/fire *restoration* — is a large adjacent market with almost identical shape (insurer-facing documentation, urgency, third-party payer) and no dedicated module today. | Not built; closest analog is the compliance-doc + insurer-portal pattern, which could be extended. |

---

## 5. Validating the Architecture Actually Generalizes

Before investing in new features, the highest-leverage next step is proving the existing
engine is really program-agnostic, because right now that claim rests on the fact that
one program (Wildfire Retrofit) was successfully expressed through it — which shows the
engine *can* represent that one case, not that it's free of hidden assumptions.

### 5.1 The "second program" acid test (do this first, cheaply)

Stand up **one additional, structurally different program** end-to-end using only admin
configuration (no code changes), e.g. **"Roof Replacement (non-wildfire)"** or
**"Kitchen Remodel."** This should exercise:
- A `service_program` (not `inspection_program`) with **no** compliance-doc step at all —
  proves quotes/work orders/invoices function without the wildfire-shaped tail.
- A different inspection template shape (e.g., a kitchen remodel "existing conditions"
  checklist with photo fields and no pass/fail evaluator rules).
- A different trade set (framing, electrical, plumbing, cabinetry) using only the trades
  catalog UI, not the frozen `TradeSchema` enum — this will immediately surface gap #3
  from Section 3 as a real blocker, not a theoretical one.
- A property enrolled in **two programs simultaneously** (e.g., wildfire retrofit AND a
  kitchen remodel on the same house) to prove `program_memberships` really supports
  concurrent, unrelated workstreams per property.

If this test can't be completed without code changes, that gap list is the real,
evidence-based backlog for "finish generalizing" — much more reliable than guessing.

---

## 6. Addressable Market Analysis

### 6.1 Today's addressable market (wildfire retrofit, as-is)

- **Geography-gated**: Oregon now; California, Colorado, Washington named as Year 2/3
  targets in `BULWARK_BUSINESS_CONTEXT.md`.
- **Demand driver**: insurer non-renewal in mapped wildfire-hazard zones — regulatory,
  urgent, but geographically concentrated and dependent on a specific (if growing)
  insurance-market dynamic.
- **Customer base for the *software*** (not the contracting business) at this scope: a
  small number of wildfire-hardening specialty GCs across 4 states. Realistically **low
  hundreds of potential software customers**, most of them small (1-3 crews). This is a
  fine niche to *dominate* but a poor SaaS TAM on its own — it's really "internal tooling
  for one operating business, licensable to a few peers," which is exactly how the BRD
  frames it today (§11: "software company... revenue line... separate venture").

### 6.2 Generalized market (full-lifecycle contractor platform)

Widening to "any contractor, any trade, full lead-to-cash-to-warranty lifecycle" puts
Bulwark in direct competition with a crowded, well-funded field:

| Competitor | Segment | Strength | Bulwark's gap vs. them today |
|---|---|---|---|
| **ServiceTitan** | Enterprise trades (HVAC/plumbing/electrical) | Deep dispatch, pricebook, marketing, financing | No dispatch calendar, no price book, no financing integrations |
| **Jobber** | SMB home-service (all trades) | Simple, fast onboarding, scheduling, invoicing, payments | No scheduling UI, no payments live yet, no mobile-native app |
| **Buildertrend** | Residential remodel/new-construction GCs | Selections, budgets, client portal, scheduling | No selections/budget module, no full client-portal parity |
| **JobNimbus / AccuLynx** | Roofing (insurance-restoration heavy) | Xactimate integration, insurance-claim workflow, roofing-specific pricebook | Closest analog to Bulwark's actual DNA (insurer-facing docs) but Bulwark has no claims/estimating integration |
| **CompanyCam** | Photo documentation for trades | Best-in-class field photo capture/annotation | Bulwark has property photos but no annotation/markup, no dedicated capture-first mobile app |

Going head-to-head as a horizontal "run your whole contracting business" platform means
competing on breadth (price book, dispatch, payments, accounting sync, mobile app
quality) where incumbents have years of head start and much larger engineering teams.
**This is not a good fight to pick directly.**

### 6.3 The recommended positioning: generalize *breadth of trades*, not *breadth of
category*

Bulwark's actual, defensible asset is the **program engine + compliance/documentation
artifact pipeline** — the ability to define, per program, exactly what must be captured
in the field, evaluate it against a rule set, and produce a signed, insurer/inspector/
lender-grade deliverable tied to real audit trail and photo evidence. That's genuinely
hard to build and not what Jobber/ServiceTitan optimize for.

The market segment where that's the differentiator, not a nice-to-have, is:
**contractors whose work must be documented for a third-party gatekeeper** —
insurers, code inspectors, government rebate/grant programs, HOAs, lenders. Concretely:

- **Wildfire/disaster hardening retrofit** (today's beachhead — keep it, it's real).
- **Storm/water/fire restoration** (insurance-claims-driven, near-identical shape:
  urgency + adjuster-facing documentation + before/after photo proof).
- **Weatherization / energy-retrofit contractors** working against utility or
  government rebate programs (documentation required to claim the rebate — same
  "compliance package" shape, different rule set).
- **Code-compliance retrofits** generally (seismic retrofit in CA, wind-mitigation
  retrofit in FL/coastal states, radon mitigation, lead/asbestos abatement) — every one
  of these is "assessment → standard-set evaluation → signed compliance package," which
  is *exactly* the engine that already exists.
- **HOA/property-management compliance sweeps** (bringing a portfolio of units into
  code/insurer compliance on a schedule) — the multi-property, multi-program,
  program-membership model already supports this shape better than a single-job tool.

**Recommendation:** market and build Bulwark as *"the operations and compliance-
documentation platform for regulated, inspection-driven trades,"* not as a generic
"run your contracting business" tool. Ship the horizontal table-stakes (scheduling,
price book, payments) because you cannot sell *any* of the above without them — but
market and prioritize deepening the program/inspection/compliance-doc engine (multi-
jurisdiction standard packs, claims/adjuster collaboration, rebate-program templates)
as the wedge feature that no horizontal competitor has.

This also directly answers the addressable-market sizing question: the horizontal
"any contractor" market is enormous (tens of billions in field-service SaaS spend) but
Bulwark would be a distant, feature-thin entrant. The "regulated/inspection-driven
trades" market is a fraction of that — but it's a market Bulwark could plausibly *lead*,
because the core differentiator already exists and no incumbent has built it this deep.

---

## 7. Recommended Roadmap

### 7.0 Guiding principle

Keep the current `BUILD_PLAN.md` L-series (launch hardening for the real first
customer) running — it's good, disciplined work and the business needs a live,
revenue-producing wildfire-retrofit customer regardless of the broader pivot. Layer the
generalization work **around** it rather than stopping it, using the epic pattern
(`PHASE1_HARDENING_PLAN.md`'s EH-series) that's already proven to work here.

### 7.1 Near-term (finish what's already 70% done — Section 3's list)

1. Run the **second-program acid test** (§5.1) and fix whatever it breaks — this is the
   cheapest possible way to convert "we think it's generic" into "we know it's generic."
2. Widen the frozen `TradeSchema` enum / WO slot validation / Subcontractor `trades[]`
   to read from the org's live trade catalog instead of a hardcoded 6-value enum.
3. Generalize the terminal artifact: rename/reshape `ComplianceDocTemplate` →
   `DocumentTemplate` (`kind: compliance_package | completion_report | warranty_cert |
   none`), and confirm `PropertyStatus`/pipeline slugs aren't secretly hardcoded past the
   pipeline layer.
4. Seed 2-3 additional programs (Roof Replacement, Kitchen/Bath Remodel, Storm
   Restoration) as real, demo-able proof points, each with its own inspection template
   and (where relevant) standard set.
5. De-wildfire the marketing surface: login copy, `/settings/programs` framing,
   business docs (BRD/business-context/screens-by-role) — cheap, high-value for
   fundraising/hiring conversations.

### 7.2 Mid-term (universal features every GC needs — genuinely new build)

Priority order, roughly by "how many verticals need this to say yes":

1. **Payments (Stripe)** — already planned as L14; just needs to not be wildfire-coded.
2. **Estimating / price book** — labor + materials catalog with assemblies; quotes pull
   from catalog items instead of free-typed line items. This is the highest-leverage
   generalization feature, because pricing consistency across trades is what makes the
   platform usable for a multi-trade GC instead of a single-program shop.
3. **Scheduling & dispatch calendar** — crew calendar, drag-drop assignment, conflict
   detection, sub availability. Currently the single biggest visible gap vs. every
   horizontal competitor.
4. **Materials / vendor / PO tracking** — even a lightweight version (vendor directory +
   PO number + received/not-received) closes a BRD-acknowledged gap.
5. **Job costing** (estimated vs. actual labor/materials cost) — depends on #2 and #4
   existing first.
6. **Notifications system, reporting depth, auth hardening** — already planned
   (EH-J/K/I, L03/L07/L08); keep on schedule, make sure copy/labels stay program-neutral
   as they're built.

### 7.3 Long-term (the differentiated wedge — where Bulwark can actually lead)

1. **Standard-set packs by jurisdiction/program type** — pre-built rule libraries for
   seismic retrofit (CA), wind mitigation (FL/coastal), weatherization rebate programs,
   radon/lead/asbestos abatement — sold as installable "program packs," the same way the
   Wildfire Retrofit program ships seeded today.
2. **Insurer/adjuster/lender/HOA external-stakeholder portal**, generalized from the
   planned insurer-only portal (L15/ADR-0004) into a reusable "external read-only
   stakeholder" pattern with per-property/per-program scoping — reusable across every
   documentation-heavy vertical in §6.3.
3. **Claims/estimating integration** (Xactimate-style) for restoration work — the single
   highest-value addition if pursuing storm/water/fire restoration as a second vertical.
4. **Rebate/grant-program compliance templates** for utility- or government-funded
   retrofit programs — same engine, new standard-set + doc-template content.
5. **Program marketplace** — once 4-5 programs exist and the engine is proven, package
   and license additional programs (built by Bulwark or by partner GCs) as an
   ecosystem/monetization layer distinct from per-seat SaaS pricing.

### 7.4 Explicitly do NOT do (avoid scope creep into a fight you'd lose)

- Don't try to out-build ServiceTitan/Jobber on pure horizontal breadth (marketing
  automation, financing integrations, native mobile apps with offline-first sync at
  their level of polish) — that's a multi-year, large-team investment with no
  differentiation upside for Bulwark specifically.
- Don't build full accounting-system replacement (QuickBooks/Xero sync is an
  integration to build later, not a reason to build general ledger features).
- Don't chase multi-currency/international tax complexity until there's a paying
  customer outside the US.

---

## 8. Architecture Changes Required (summary, technical)

| Change | Type | Why |
|---|---|---|
| Widen `TradeSchema` enum consumers (WO slots, Sub `trades[]`) to reference the live `trades` table | Contract + validation change | Trade catalog is currently cosmetic for anything outside the original 6 wildfire trades |
| Introduce `DocumentTemplate`/`DeliverableTemplate` generalizing `ComplianceDocTemplate` | Contract + schema + service rename/extend | Terminal artifact is currently modeled as compliance-doc-shaped even for programs that shouldn't have one |
| Add a `quote_line_item`/price-book layer (materials + labor catalog, assemblies) sitting *above* today's denormalized JSONB line items | Net-new contract + schema + service | Needed for cross-trade estimating consistency; today's "no line-item table" decision was reasonable for wildfire-only MVP scale and should be revisited now |
| Add scheduling primitives (crew/resource calendar entity, conflict-checking) | Net-new contract + schema + service | WO `schedule fields` exist but there's no calendar/board consuming them |
| Add materials/vendor/PO entities | Net-new contract + schema + service | Zero schema today |
| Generalize insurer portal pattern into a reusable external-stakeholder role/scoping primitive | Contract design change (do this *before* building L15, not after) | Avoids rebuilding the same portal pattern per vertical (lender, HOA, adjuster) |
| Confirm/enforce that `PropertyStatus`/pipeline authority is fully runtime-data, not enum-gated | Verification + possible contract change | Needed so non-wildfire programs aren't stuck with wildfire-shaped status names |
| Retire the legacy hardcoded wildfire evaluator path in favor of the generic evaluator-rule engine everywhere | Cleanup | Two parallel evaluators (legacy + generic) is a correctness and maintenance risk once more programs exist |

None of these require touching the tenancy model, the Zod contract-first discipline,
the audit log, the job queue, or the auth/session architecture — those are
vertical-agnostic already and are the parts of this codebase least in need of change.

---

## 9. Risks & Recommendations

| Risk | Mitigation |
|---|---|
| Team spends the pivot rebuilding things that already work (programs/templates/pipelines exist) instead of the genuinely missing horizontal features (price book, scheduling, payments). | Treat Section 3 as a short, mechanical punch-list; treat Section 4.2 as the real roadmap. Run the §5.1 acid test before writing a single new epic. |
| Positioning drifts into "generic contractor SaaS," diluting the one real differentiator (compliance/documentation engine) against much better-funded horizontal competitors. | Adopt the §6.3 positioning explicitly in product/marketing decisions: lead with regulated/inspection-driven trades, not "any contractor." |
| The first real paying customer (wildfire retrofit, per `BUILD_PLAN.md`) gets starved of attention while the team chases generalization. | Keep L-series launch hardening on its current track; layer generalization epics alongside it (as `PHASE1_HARDENING_PLAN.md` already modeled with parallel subagent waves), don't replace it. |
| Frozen enums (`TradeSchema`, legacy status enums) get "discovered" mid-build of a second program, causing rework. | Do the §5.1 second-program test *first*, specifically to surface these before committing to a big roadmap. |
| Terminal-document generalization (`ComplianceDocTemplate` → generic) touches a lot of surface area (PDF rendering, signature capture, branding, homeowner/portal views). | Scope it as its own epic with a real design doc/ADR before touching code — this is the single largest rename/reshape in the whole plan. |

---

## 10. Appendix — Current Feature Matrix

| Capability | Status | Vertical-neutral? |
|---|---|---|
| Multi-tenant org/user/role/membership | ✅ Built | ✅ Yes |
| Program model (inspection_program / service_program) | ✅ Built | ✅ Yes (only 1 program seeded) |
| Trade catalog | ✅ Built (contract) | ⚠️ Partial (enum still frozen downstream) |
| Inspection template engine (dynamic fields, evaluator rules) | ✅ Built | ✅ Yes |
| Standards / evaluator | ✅ Built (per-org override) | ⚠️ Only Oregon wildfire standards seeded |
| Status pipelines (admin-editable) | ✅ Built | ⚠️ Seed enums still wildfire-flavored |
| CMS label registry | ✅ Built | ✅ Yes |
| Buildings + sections + multi-contact | ✅ Built | ✅ Yes |
| Property/Client/Contact CRM | ✅ Built | ✅ Yes |
| Quotes (tiers, line items, PDF) | ✅ Built | ⚠️ No price book/catalog yet |
| Change orders | ✅ Built | ✅ Yes |
| Work orders (trade slots, schedule fields) | ✅ Built | ⚠️ No calendar/dispatch UI |
| Subcontractor management + COI | ✅ Built | ✅ Yes |
| Compliance doc generation (async PDF, signature) | ✅ Built | ❌ Wildfire-shaped terminal artifact |
| Invoices + manual payments | ✅ Built | ✅ Yes |
| Online payments (Stripe) | ❌ Not built | — |
| Estimating / price book / materials catalog | ❌ Not built | — |
| Scheduling & dispatch calendar | ❌ Not built (page stub only) | — |
| Materials / vendor / PO management | ❌ Not built | — |
| Time tracking / labor actuals | ❌ Not built | — |
| Job costing (est. vs actual) | ❌ Not built | — |
| Notifications system | ⚠️ Partial (subscriptions + audit persistence; email/SMS providers stub-fallback) | ✅ Yes |
| Reporting/dashboards | ⚠️ Real but shallow | ✅ Yes |
| Insurer / external-stakeholder portal | ❌ Not built (ADR only) | Should be generalized before building |
| Field photo capture + upload | ⚠️ Schema exists; real R2 upload not finished (L01/L02) | ✅ Yes |
| Offline / PWA | ❌ Not built | — |
| Auth hardening (CSRF, MFA policy, lockout, session timeout) | ❌ Not built | — |
| Audit log | ✅ Built | ✅ Yes |
| Observability (Sentry, metrics, health checks) | ⚠️ Partial | ✅ Yes |
| Demo site | ✅ Built (frozen) | ❌ Wildfire-only narrative |

---

## 11. Appendix — Source Documents Consulted

- `bulwark/BUILD_PLAN.md`, `bulwark/BUILD_STATUS.md`, `bulwark/PRODUCTION_GAP_REGISTER.md`
- `bulwark/PHASE1_HARDENING_PLAN.md` (source of the original GC-generalization mandate,
  D-H4, and the program/label/pipeline architecture referenced throughout)
- `bulwark/docs/BULWARK_BRD.md`, `bulwark/docs/BULWARK_BUSINESS_CONTEXT.md`,
  `bulwark/docs/BULWARK_TECH.md`
- `bulwark/shared/contracts/*.ts` (program, trade, building, contact, inspection-template,
  inspection, property, quote, compliance, status-pipeline, standards)
- `bulwark/shared/inspection-templates/wildfire-defaults.ts`,
  `bulwark/shared/utils/compliance.ts`
- `bulwark/server/services/*.real.ts`, `bulwark/server/db/schema/*.ts`
- `bulwark/app/pages/**` (admin/field/sub/homeowner portal surfaces)
- `bulwark/agents/decisions/ADR-0001` through `ADR-0010`; `bulwark/agents/epics/L01-L20`

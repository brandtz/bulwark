# BULWARK — Business Requirements Document
> AI Agent Instruction Manual | Version 1.1 | Bulwark Operations Platform
> v1.1 — Added Drew/Jeff partner context, removed stale "multi-tenant out of scope" line, added Section 10 (User Systems & Screen Inventory) and Section 11 (Build Approach — Frontend-First).

---

## 1. Project Overview

**Codename:** Bulwark  
**Working Description:** Wildfire Retrofit Operations & Compliance Platform  
**Status:** Pre-development — greenfield build  
**Target Launch:** MVP within 4–6 weeks of partner GC licensure  

### Problem Statement

Eastern Oregon homeowners in wildfire hazard zones are increasingly unable to obtain or renew homeowner's insurance due to noncompliant building materials — primarily wood siding, asphalt shingle roofing, open eaves, and non-ember-resistant vents. State and county wildfire hardening standards now require specific retrofit upgrades before insurers will bind policies.

A licensed GC operating in this niche has a near-infinite pipeline of retrofit work: the demand is regulatory, urgent, and geographically concentrated. The bottleneck is not labor — it is the operational infrastructure to intake properties, assess them, quote and schedule work, manage subcontractors, and produce the insurance-ready compliance documentation that closes the loop for the homeowner.

**Bulwark is the operating system for that business.**

---

## 2. Business Model

### Partnership Structure

| Role | Partner | Responsibilities |
|---|---|---|
| CTO / COO / Tech | Matthew Brandt (Brandtworks-Enterprises LLC) | Tech stack, platform, client ops, admin, vendor relationships, billing, compliance documentation |
| GC / Field Lead | Drew | Licensed contracting (in progress), field assessments, sub coordination, sales relationships, Eastern Oregon operations |
| Investor / Insurance Liaison (potential) | Jeff | Capital, insurance industry connections, possible co-venture entity |

A separate co-venture entity — distinct from Brandtworks-Enterprises LLC — may be formed with Drew, Matthew, and Jeff to operate the Bulwark business directly.

Bulwark is built and operated as a vertical SaaS product under the Brandtworks "nothing." ecosystem from day one. The architecture is multi-tenant by default — see `CONVENTIONS.md` and `BULWARK_TECH.md`. The first tenant is the Drew + Matthew + (Jeff) operating entity. Future tenants are other retrofit GC firms across OR, CA, CO, WA. A "SaaS pivot" is not a future state — it is the architecture from day one.

### Revenue Model (Business Level)
- Per-job contract revenue from wildfire retrofit work
- Fixed-price retrofit packages (Tier 1: roofing only, Tier 2: siding + roofing, Tier 3: full hardening)
- Insurance documentation package as an upsell to homeowners who need expedited paperwork

---

## 3. User Personas

### 3.1 — Matthew (Admin / COO)
- Manages the platform, client records, billing, and document generation
- Needs dashboards, financial reporting, pipeline visibility, and system configuration
- Not typically in the field

### 3.2 — GC Partner (Field Lead / Owner-Operator)
- Primary field user; assesses properties, manages subs, closes client relationships
- Needs fast mobile-first property intake, work order assignment, and job status tracking
- Phase 3+: Audio field reporting

### 3.3 — Subcontractor
- Receives assigned work orders
- Needs simple job view: address, scope, materials, schedule
- No financial visibility into the job
- Phase 2: Subcontractor portal / mobile view

### 3.4 — Homeowner (Client)
- Needs a progress view and document download for their insurance provider
- Phase 2: Client portal with read-only job status and compliance doc access

---

## 4. Core Workflows

### Workflow A — Lead Prospecting
```
Zone selection (county/parcel layer)
  → Filter by wildfire hazard zone + non-compliant material indicators
  → Build property inventory (address, owner name, parcel ID)
  → Assign outreach status (not contacted / called / interested / declined)
  → Convert interested leads to active clients
```

### Workflow B — Property Intake & Assessment
```
Create new property record
  → Enter address, owner info, parcel ID
  → Complete assessment checklist:
       - Siding material + square footage (per face)
       - Roofing material + age
       - Eave type (open / enclosed)
       - Vent type (ember-resistant / standard)
       - Deck material if applicable
       - Access notes
  → System flags non-compliant items against OR wildfire hardening standards
  → Generate recommended upgrade list
```

### Workflow C — Quoting
```
Assessment → recommended upgrade list
  → Select upgrade scope (full / partial)
  → Attach labor and material costs per line item
  → Apply markup / margin
  → Generate client-facing quote PDF
  → Track quote status (sent / accepted / declined / revised)
```

### Workflow D — Work Order & Sub Management
```
Accepted quote → create work order
  → Break work order into trades (roofing, siding, carpentry)
  → Assign sub per trade
  → Set schedule and material delivery notes
  → Track progress (not started / in progress / inspection ready / complete)
```

### Workflow E — Compliance Documentation
```
Work order complete
  → Log permit numbers and inspection sign-off dates
  → System generates compliance package:
       - Scope of work summary
       - Materials used (with fire-rating specs)
       - Permit records
       - Before/after photo log
       - GC certification statement
  → Export as signed PDF for homeowner → insurer submission
```

### Workflow F — Payment
```
Work complete + compliance doc issued
  → Generate invoice
  → Track payment status
  → Record payment received
  → Phase 2: Stripe integration for card/ACH
```

---

## 5. Feature Requirements by Phase

### MVP (Phase 1) — Internal ops, GC is active, first jobs flowing

| Feature | Priority | Notes |
|---|---|---|
| Property CRM — client pipeline | P0 | Kanban or list view by stage |
| Property profile — material spec fields | P0 | Drives assessment and compliance |
| Assessment checklist + compliance gap flagging | P0 | Hardcoded to OR wildfire standards |
| Quote builder | P0 | Line-item labor + materials + margin |
| Quote PDF export | P0 | Client-facing |
| Work order creation + sub assignment | P0 | Per-trade breakdown |
| Job status tracking | P0 | Dashboard view |
| Compliance document generator | P0 | PDF output for insurer |
| Basic invoice + payment tracking | P0 | Manual, no Stripe yet |
| User auth (Matthew + GC partner) | P0 | Two admin users only at MVP |

### Phase 2 — Operations maturing, volume increasing

| Feature | Priority |
|---|---|
| Subcontractor portal (job view, no financials) | P1 |
| Client portal (status view + doc download) | P1 |
| Stripe invoicing + payment | P1 |
| Vendor / supplier management | P1 |
| Photo upload per job (before/after) | P1 |
| Permit record management | P1 |
| Reporting dashboard (revenue, jobs, pipeline) | P1 |

### Phase 3 — Scale and intelligence

| Feature | Priority |
|---|---|
| Geographic lead prospecting (parcel + hazard zone data) | P2 |
| Outbound CRM pipeline (call tracking, status) | P2 |
| Automated compliance doc assembly | P2 |
| Mobile-optimized field view | P2 |

### Phase 3+ — Audio Field Reporting

| Feature | Notes |
|---|---|
| Mobile audio capture (hold-to-record) | PWA or native wrapper |
| Whisper API transcription | Sub-3 second turnaround |
| Claude API structured extraction | Transcript → property record JSON |
| GC review + confirm UI | Pre-filled form, one-tap confirm |

> **Architecture note:** Design property assessment schema fields to match natural spoken language patterns used in field reporting (e.g., `siding_material`, `siding_sqft_per_face`, `roof_type`, `eave_type`). This ensures clean AI extraction when Phase 3+ audio pipeline is built.

---

## 6. Compliance Reference

Oregon wildfire hardening standards (ORS / OAR) and insurer requirements generally mandate:

- **Roofing:** Class A fire-rated (metal, tile, or Class A asphalt)
- **Siding:** Non-combustible or ignition-resistant (fiber cement, stucco, metal, masonry)
- **Eaves:** Enclosed or boxed (no open rafter tails)
- **Vents:** Ember-resistant (mesh ≤ 1/16" or listed ember-resistant products)
- **Decking:** Non-combustible or 1-hour rated materials preferred
- **Zone 1 clearance:** 0–5 ft non-combustible zone around structure

> The assessment checklist and compliance gap logic should be built against these standards and be configurable as standards evolve.

---

## 7. Data Entities (High Level)

- **Property** — address, parcel ID, owner, hazard zone, current material specs, compliance status
- **Client** — owner contact info, pipeline stage, notes, linked property
- **Assessment** — checklist results, flagged items, assessor, date
- **Quote** — line items, totals, margin, status, linked assessment
- **WorkOrder** — scope, assigned subs, schedule, progress status, linked quote
- **SubContractor** — contact, trade(s), license info, rate
- **Vendor/Supplier** — contact, materials supplied, preferred status
- **ComplianceDoc** — linked work order, permit numbers, photo references, generated PDF, issue date
- **Invoice** — line items, total, status, payment date
- **Lead** — address, owner, parcel ID, hazard zone, outreach status (Phase 3)

---

## 8. Out of Scope (MVP)

- Mobile native app (responsive web / PWA only at MVP)
- Third-party insurance API integration (homeowner submits docs manually)
- Automated permit filing
- Payroll / contractor W-9 management (manual process for now)
- Self-service tenant onboarding (new orgs are provisioned by super_admin until Phase 4+)

> Note: Multi-tenant / multi-company architecture **is** in scope for MVP. See `CONVENTIONS.md` and `BULWARK_TECH.md` for the multi-tenancy implementation. Self-service onboarding of new tenants is what's deferred — not the underlying tenancy model.

---

## 9. Success Criteria

- GC partner can intake a new property and generate a quote in under 10 minutes
- Compliance documentation can be generated and exported in under 5 minutes after job completion
- Matthew can see full pipeline, financials, and job status from one dashboard view
- Zero tolerance for slow page loads — all primary views must render under 300ms

---

## 10. User Systems & Screen Inventory

The Bulwark application is organized into five user systems. Build priority is Admin → Contractor → Subcontractor → Homeowner, with shared/foundation screens preceding all of them.

| System | Role(s) | Build Priority | Screen Count (MVP / Total) |
|---|---|---|---|
| Shared / Foundation | All | P0 | 8 / 8 |
| Admin | super_admin, org_admin | P1 | 23 / 31 |
| Contractor | org_manager, field | P2 | 5 / 5 |
| Subcontractor | sub_contractor | P2 (Phase 2) | 0 / 5 |
| Homeowner | homeowner (client portal) | P3 (Phase 2) | 0 / 8 |

The full screen inventory, status, and per-screen build sequence live in **`BULWARK_SCREENS_BY_ROLE.md`**, which is the canonical reference. When this BRD and that document disagree, the screens document wins.

---

## 11. Build Approach — Frontend-First

Bulwark will be built **frontend-first**. The sequence is:

1. **Phase 0 (Spec)** — Complete all `CONTRACTS.md`, `CONVENTIONS.md`, `DECISIONS.md`, `UI-CONTRACTS.md`, full Drizzle schema, error taxonomy, Zod validators, and all Playwright stubs. Non-negotiable before any UI code.
2. **Frontend** — Build UI screens against mock data that conforms to the Phase 0 contracts.
3. **Backend** — Wire backend services to the same contracts, screen by screen.
4. **QA** — Continuous, screen-by-screen, as backend wires in. Not a final integration pass.

Why: it lets functionality be steered as it appears — the UI surfaces real interaction problems before they're locked into backend assumptions. The risk of FE-first is building UI the backend can't populate; this is mitigated by enforcing spec-first Phase 0.

Build environment: **VS Code + GitHub Copilot agentic AI team** following the prompt-driven workflow defined in `CONVENTIONS.md` Section 12 and the `agents/` folder structure.

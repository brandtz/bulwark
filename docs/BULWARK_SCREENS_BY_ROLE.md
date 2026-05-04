# BULWARK — Screens by User System
> Canonical Screen Inventory & Build Priority Reference
> Version 1.0 | Brandtworks-Enterprises LLC
> Supersedes the flat 23-screen list in earlier versions of `BULWARK_UX_CONTEXT.md`.

---

## Purpose of This Document

This is the single source of truth for:

1. Every screen in the Bulwark application
2. Which user system each screen belongs to
3. Build priority order
4. Spec status (specified in `BULWARK_UX_CONTEXT.md` vs. needed but not yet specified)
5. Phase assignment (MVP / Phase 2 / Phase 3+)

When this document and any other Bulwark document disagree about which screens exist or which role they belong to, this document wins.

---

## Build Priority

The build sequence for Bulwark is, in order:

1. **Admin (P1)** — full-access role. Most screens are built here first because Admin is the superset of permissions. The Contractor role is a permissions-restricted subset of these same screens, not a separate set.
2. **Contractor (P2)** — mobile-optimized variants and field-only screens. Most screens in this group are existing Admin screens with restricted access; only the truly field-only screens are net-new builds.
3. **Subcontractor (P2 / Phase 2)** — separate restricted portal. Deferred to Phase 2.
4. **Homeowner (P3)** — separate read-only client portal. Deferred to Phase 2 onward.

Within each system, foundation screens (login, settings) are built before workflow screens, and workflow screens are built before reporting screens.

---

## Build Approach — Frontend-First

Bulwark will be built **frontend-first** under this sequence:

1. Phase 0 spec docs are completed first (CONTRACTS.md, schema, error taxonomy, Zod validators, Playwright stubs). These are non-negotiable before any UI code.
2. Frontend screens are then built against mock data that conforms to the contracts.
3. Backend services are wired in incrementally, screen by screen, against the same contracts.
4. QA happens continuously as each screen is wired up — not in a final pass.

Why: it lets Matthew steer functionality screen-by-screen rather than discover at integration time that the backend produced data shapes the UI cannot consume. The risk of FE-first — building a beautiful UI the backend cannot populate — is mitigated by enforcing the spec-first Phase 0.

This is built using **VS Code + GitHub Copilot agentic AI team**, following the prompt-driven workflow defined in `CONVENTIONS.md` Section 12 and the `agents/` folder.

---

## System 1 — Shared / Foundation

These screens are used across all roles and are pre-requisites for any role-specific work.

| ID | Screen | Spec Status | Phase | Notes |
|---|---|---|---|---|
| 01 | Login | Spec'd | MVP | Single screen handles all roles |
| AUTH-02 | Forgot Password | Needed | MVP | Master Checklist has it stubbed disabled — promote to MVP |
| AUTH-03 | Password Reset | Needed | MVP | |
| AUTH-04 | Accept Invite / Set Password | Needed | MVP | Multi-tenant invite flow |
| AUTH-05 | Org Switcher | Needed | MVP | Required for super_admin and any user belonging to >1 org |
| ERR-01 | 404 Not Found | Needed | MVP | |
| ERR-02 | 403 Forbidden | Needed | MVP | Tenant firewall denial page |
| ERR-03 | 500 Server Error | Needed | MVP | Generic structured error page |

---

## System 2 — Admin (P1)

Full-access role. `org_admin` role within a tenant; `super_admin` for Matthew/BWE across all tenants.
This is the largest screen set and is built first.

### MVP Screens — Admin

| ID | Screen | Spec Status | Notes |
|---|---|---|---|
| 03 | Admin Dashboard | Spec'd | KPI cards, pipeline preview, revenue chart |
| 04 | Property Pipeline (Kanban) | Spec'd | Desktop variant with drag-drop |
| 05 | Property Detail Hub | Spec'd | Full tabs including financials |
| 06 | New Property Intake | Spec'd | Shared form with Contractor |
| 07 | Client / Owner Contact Detail | Spec'd | |
| 08 | Assessment Form | Spec'd | Shared form with Contractor |
| 09 | Assessment Summary | Spec'd | |
| 10 | Quote Builder | Spec'd | Admin-only at MVP — financial data |
| 11 | Quote Review / Preview | Spec'd | |
| 12 | Quote List | Spec'd | |
| 13 | Work Order Detail | Spec'd | |
| 14 | Job Progress Update | Spec'd | Shared with Contractor |
| 15 | Subcontractor List | Spec'd | |
| 16 | Subcontractor Detail | Spec'd | |
| 17 | Compliance Document Generator | Spec'd | GC signature captured here |
| 18 | Compliance Document Preview | Spec'd | |
| 19 | Invoice List | Spec'd | |
| 20 | Invoice Detail | Spec'd | |
| 21 | Company & GC Info Settings | Spec'd | |
| 22 | User Management Settings | Spec'd | Needs multi-tenant role assignment columns |
| 23 | Compliance Standards Config | Spec'd | |
| ADM-24 | Audit Log Viewer | Needed | CONVENTIONS makes audit logging mandatory; needs a UI for review |
| ADM-31 | API Keys Management | Needed | Service-to-service auth — issue, rotate, revoke keys |

### Phase 2 Screens — Admin

| ID | Screen | Spec Status | Notes |
|---|---|---|---|
| ADM-25 | Reports & Analytics | Needed | Revenue, jobs, conversion funnel, GC productivity |
| ADM-26 | Vendor / Supplier List | Needed | |
| ADM-27 | Vendor / Supplier Detail | Needed | |
| ADM-28 | Property Photo Gallery | Needed | Before/after photos per property |
| ADM-29 | Permit Records | Needed | Permit list, status, association to work orders |
| ADM-30 | Notifications Center | Needed | In-app notifications + preferences |

### Phase 3+ Screens — Admin

| ID | Screen | Spec Status | Notes |
|---|---|---|---|
| ADM-32 | Lead Prospecting Map | Needed | Geographic parcel + hazard zone overlay |
| ADM-33 | Lead Outreach Tracking | Needed | Outbound CRM list, call status |

---

## System 3 — Contractor (P2)

Mobile-optimized field role. `field` or `org_manager` role within a tenant. Drew is the prototype user.
Most screens here are existing Admin screens accessed with restricted permissions; only the dashboard and field-only utilities are net-new.

### Shared Screens — Contractor Variants

These are existing Admin screens that the Contractor accesses with reduced permissions. The build work is permission-scoping and mobile-layout polish, not net-new screens.

| ID | Screen | Difference From Admin View |
|---|---|---|
| 04 | Property Pipeline (mobile list view) | Mobile collapses Kanban to list; FT-12 toggle between Pipeline / List |
| 05 | Property Detail Hub | Financials tab hidden; Quote tab read-only |
| 06 | New Property Intake | Identical |
| 08 | Assessment Form | Identical (this is the primary contractor screen) |
| 14 | Job Progress Update | Identical (primary contractor screen) |
| 17 | Compliance Doc Generator | Field can capture signature; admin generates final |

### Net-New Screens — Contractor

| ID | Screen | Spec Status | Phase | Notes |
|---|---|---|---|---|
| 02 | Field Dashboard | Spec'd | MVP | Mobile-first home for the GC partner |
| CON-01 | My Profile / Account | Needed | MVP | |
| CON-02 | My Assigned Jobs | Needed | MVP | Filtered work order list — only jobs assigned to current user |
| CON-03 | Audio Field Note Capture | Needed | Phase 3+ | PWA hold-to-record → Whisper → Claude extraction |
| CON-04 | Offline Sync Queue | Needed | MVP | Status of pending offline writes per CONVENTIONS offline rule |

---

## System 4 — Subcontractor (P2 / Phase 2)

Restricted portal. `sub_contractor` role within a tenant. Sees only their assigned jobs, no financial data.
Deferred to Phase 2 per BRD.

| ID | Screen | Spec Status | Phase | Notes |
|---|---|---|---|---|
| SUB-01 | Sub Login | Needed | Phase 2 | Same auth backend, separate landing |
| SUB-02 | Sub Job List | Needed | Phase 2 | Only jobs assigned to this sub |
| SUB-03 | Sub Job Detail | Needed | Phase 2 | Scope, address, schedule, materials — no $ values |
| SUB-04 | Sub Status Update | Needed | Phase 2 | Mark trade complete, photo capture |
| SUB-05 | Sub Profile | Needed | Phase 2 | License #, insurance expiry, contact |

---

## System 5 — Homeowner (P3)

Public-facing client portal. Read-only access to their own property records and document downloads.
Deferred to Phase 2/3 per BRD. Auth model TBD — likely magic-link rather than password.

| ID | Screen | Spec Status | Phase | Notes |
|---|---|---|---|---|
| HO-01 | Public Landing / Lead Capture | Needed | Phase 2 | Marketing page with "request assessment" CTA |
| HO-02 | Lead Intake Form (public) | Needed | Phase 2 | Captures address, contact, hazard concerns; creates a Lead record |
| HO-03 | Homeowner Login | Needed | Phase 2 | Likely magic-link based |
| HO-04 | Homeowner Dashboard | Needed | Phase 2 | Property summary, current job stage, key dates |
| HO-05 | Job Progress View | Needed | Phase 2 | Read-only timeline of work order milestones |
| HO-06 | Document Library | Needed | Phase 2 | Compliance doc + before/after photos |
| HO-07 | Invoice View / Online Payment | Needed | Phase 2 | Stripe integration |
| HO-08 | Profile / Notifications | Needed | Phase 2 | |

---

## Total Screen Count Summary

| System | MVP | Phase 2 | Phase 3+ | Total |
|---|---|---|---|---|
| Shared / Foundation | 8 | 0 | 0 | 8 |
| Admin | 23 | 6 | 2 | 31 |
| Contractor (net-new) | 4 | 0 | 1 | 5 |
| Subcontractor | 0 | 5 | 0 | 5 |
| Homeowner | 0 | 8 | 0 | 8 |
| **TOTAL** | **35** | **19** | **3** | **57** |

Note: 23 of the 35 MVP screens are already specified in `BULWARK_UX_CONTEXT.md`. The remaining 12 MVP screens (8 Shared + ADM-24, ADM-31, CON-01, CON-02, CON-04) need specifications written before frontend build can begin on them.

---

## Wireframe Status

Matthew has wireframes for the first ~20 screens generated via UX Pilot AI. Those wireframes correspond to a subset of the 23 originally-specified screens. The wireframes folder is a working artifact and not enumerated here — refer to `agents/wireframes/` once exported into the repo.

The 12 newly-identified MVP screens listed above do not yet have wireframes. They need:
1. A spec written into `BULWARK_UX_CONTEXT.md` (or a supplement)
2. A wireframe generated
3. A `.github/ui-specs/[screen].md` file created

---

## Build Sequencing Within Phase 0 → Phase 1

Recommended FE-first build order, screen by screen:

**Phase 0 (Foundation, no app code yet)**
- All Phase 0 spec docs per `BULWARK_Master_Checklist.pdf` Section 2
- Specs for the 12 newly-identified MVP screens added to UX_CONTEXT or supplement

**Phase 1 (Foundation screens — both backend and frontend)**
- 01 Login + AUTH-02/03/04 + ERR-01/02/03 — must work end-to-end first; nothing else can be built without auth

**Phase 2 (Admin core workflow — FE first, BE wired in immediately after)**
- 04 Property Pipeline → 06 Property Intake → 05 Property Detail Hub → 07 Client Contact
- 08 Assessment Form → 09 Assessment Summary
- 10 Quote Builder → 11 Quote Preview → 12 Quote List
- 13 Work Order Detail → 14 Job Progress Update
- 17 Compliance Doc Generator → 18 Compliance Doc Preview
- 19 Invoice List → 20 Invoice Detail

**Phase 3 (Admin supporting screens)**
- 03 Admin Dashboard (now data exists to display)
- 15 Subcontractor List → 16 Subcontractor Detail
- 21 Company Settings → 22 User Management → 23 Standards Config
- ADM-24 Audit Log Viewer → ADM-31 API Keys
- AUTH-05 Org Switcher

**Phase 4 (Contractor specialization)**
- 02 Field Dashboard
- CON-01, CON-02, CON-04
- Mobile polish on shared screens (04, 05, 06, 08, 14, 17)

**Phase 5+ (Phase 2 and beyond, per BRD phasing)**
- Subcontractor portal
- Homeowner portal
- Phase 3 lead prospecting
- Phase 3+ audio field reports

The Admin Dashboard (03) intentionally moves from "first thing built" to mid-Phase-3 — it needs real data flowing through the workflows to be designable rather than guessed at.

---

*BULWARK_SCREENS_BY_ROLE.md — Version 1.0*
*Maintained by Brandtworks-Enterprises LLC*
*Update this document whenever a screen is added, renamed, or re-prioritized.*

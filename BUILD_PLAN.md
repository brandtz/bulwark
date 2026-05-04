# Bulwark — Build Plan

> **Status**: Living document. Maintained by the agentic team; reviewed by the human sponsor (Matthew).
> **Last updated**: 2026-05-03
> **Supersedes**: nothing — this is the first end-to-end execution plan.

---

## 1. Purpose

This document is the master execution plan for turning Bulwark from a working demo
([`demo/`](demo/)) into the real product described in [`docs/BULWARK_BRD.md`](docs/BULWARK_BRD.md)
and [`docs/BULWARK_TECH.md`](docs/BULWARK_TECH.md).

It enumerates **every epic**, the **dependency order** between them, and the
**slice strategy** that lets the human sponsor diagnose progress visually before
any backend code exists.

---

## 2. Top-Level Decisions (locked in this plan)

| # | Decision | Rationale | Alternative considered |
|---|---|---|---|
| D1 | **Frontend-first build sequence** | BRD §11 mandates it. Lets sponsor steer UX before backend assumptions calcify. | Backend-first — rejected: produces invisible progress. |
| D2 | **Real app lives at repo root** (not in `demo/`). `demo/` stays as a frozen vaporware sandbox for investor demos. | Two artifacts, one repo. Demo never breaks because product code never touches it. | Replace demo in place — rejected: loses the investor asset and conflates two audiences. |
| D3 | **Stack: Nuxt 3 + TS strict + Tailwind v3 + Drizzle + Neon Postgres + Pinia + Playwright + Vitest + JOSE + nuxt-auth-utils** | Locked by [`docs/BULWARK_TECH.md`](docs/BULWARK_TECH.md) §1. | Next.js (the boilerplate's stack) — rejected: violates the BRD's locked stack and would require rewriting all type/server contracts. |
| D4 | **MockService layer** — every domain service has a `Mock<X>Service` and a `Real<X>Service` that satisfy the same Zod-validated contract from [`CONTRACTS.md`](CONTRACTS.md). The UI imports a `useService('property')` composable that resolves to mock during E0–E10 and real from E11 onward. | Lets us ship FE without DB. Same contract = no rewrite when wiring backend. | Stub data inline per-component — rejected: untestable, drifts from contract, leaves orphaned fixtures everywhere. |
| D5 | **Single `AppLayout` shell** owns nav. No page declares its own sidebar/topbar/bottom-nav. Permission-gated nav lives in one declarative `nav.config.ts` file. | Solves the inconsistency the sponsor flagged in the demo (sidebar disappears between pages, dark-vs-light flips). One layout, one nav, one source of truth. | Per-page layout — rejected: causes exactly the inconsistency we're fixing. |
| D6 | **Every configurable thing has an Admin screen.** "Configurable" is enumerated in §6 below — including statuses, material lists, trades, document templates, compliance standards, notification preferences, API keys, roles, and feature flags. | Sponsor explicit requirement. Prevents config drift into code constants. | Config-as-code — rejected for tenant-facing tunables; retained only for system-level constants (rate limits, page sizes). |
| D7 | **Playwright test required for every UI-affecting story.** A story is not "done" until it has a passing Playwright spec covering happy path + at least one negative. CI blocks merge on Playwright failure. | Sponsor explicit requirement. Enables fearless regression as scope grows. | Snapshot tests only — rejected: don't catch interaction regressions (the kind that broke nav consistency in the demo). |
| D8 | **Comment density floor**: every non-trivial file (>40 lines) has a top-of-file *natural language* block explaining purpose, key decisions, and decisions-not-taken. Every non-trivial function has a docblock with the same. We code as though the next maintainer is a human armed with an agentic copilot — not a single-author ninja. | Sponsor explicit requirement. Agent-authored code is high-volume and looks confident even when wrong; rich rationale comments are the only way a human reviewer can audit "why." | Standard JSDoc — rejected as too thin; doesn't capture rejected alternatives. |
| D9 | **Boilerplate** at [`boilerplate/`](boilerplate/) is Next.js (PM dashboard). We **do not** fork its app code (wrong framework). We **do** adopt its `agents/` governance pattern: [epic-template](boilerplate/agents/templates/epic-template.md), [story-template](boilerplate/agents/templates/story-template.md), handoff and review standards. Those are stack-agnostic. | Lets us reuse battle-tested process discipline without dragging in a Next.js app shell. | Re-derive from scratch — rejected: wastes the work captured in the boilerplate. |
| D10 | **Slice contract: every story is "shippable on its own."** A story may not depend on the *next* story's code to render. If a slice produces an unusable screen, the slice was scoped wrong. | Sponsor diagnoses progress per merge. | Big-bang epic merges — rejected: hides regressions. |

ADRs that formalize these live in [`DECISIONS.md`](DECISIONS.md).

---

## 3. Repo Layout (after E0 lands)

```
bulwark/
├── app/                         # Nuxt 3 source (real product)
│   ├── pages/                   # File-based routes
│   ├── layouts/                 # default.vue (AppShell), auth.vue, public.vue
│   ├── components/
│   │   ├── ui/                  # Button, Input, Card, StatusBadge… (UI-CONTRACTS.md)
│   │   └── nav/                 # Sidebar, BottomNav, TopBar, Breadcrumbs
│   ├── composables/             # useAuth, useService, usePermissions
│   ├── stores/                  # Pinia stores
│   ├── middleware/              # auth.global.ts, role-based guards
│   ├── plugins/                 # services.client.ts (mock vs real switch)
│   └── assets/css/
│       └── tokens.css           # ALL design tokens from STYLE_GUIDE
├── server/                      # Nitro server — built E11
│   ├── api/
│   ├── services/                # Real<X>Service classes
│   ├── db/schema/               # Drizzle tables — built E0
│   ├── errors/                  # Error taxonomy — built E0
│   ├── middleware/
│   └── utils/
├── shared/
│   ├── contracts/               # Zod schemas — built E0, single source of truth
│   ├── types/                   # Inferred from Zod
│   ├── mocks/                   # MockService + fixture data — built E0
│   └── nav/                     # nav.config.ts — built E1
├── tests/
│   ├── e2e/                     # Playwright — one spec per story
│   ├── unit/                    # Vitest
│   └── fixtures/                # Test data factories
├── agents/
│   ├── epics/                   # E00–E13.md — built right now
│   ├── stories/                 # E0X-S0Y-<slug>.md — built per epic
│   ├── handoffs/                # Per-session handoff notes
│   ├── decisions/               # ADRs (ADR-NNNN-<slug>.md)
│   ├── wireframes/              # (existing) UX Pilot exports
│   └── standards/               # Symlink/mirror of boilerplate standards we adopt
├── demo/                        # Frozen investor demo — do not touch
├── docs/                        # BRD, TECH, STYLE_GUIDE, etc. — pre-existing
├── boilerplate/                 # Vendored agentic-team boilerplate — do not touch
├── BUILD_PLAN.md                # this file
├── CONTRACTS.md                 # API + service contracts — built E0
├── DECISIONS.md                 # ADR index — built E0
├── UI-CONTRACTS.md              # Component prop contracts — built E0
├── BUILD_STATUS.md              # Live state of which epic/story is in flight
├── CONVENTIONS.md               # already in docs/, lifted to root in E0
├── nuxt.config.ts
├── drizzle.config.ts
├── playwright.config.ts
├── package.json
└── tsconfig.json
```

---

## 4. Epic Catalog

Each epic file lives at `agents/epics/E<NN>-<slug>.md`. Stories under each epic
live at `agents/stories/E<NN>/E<NN>-S<NN>-<slug>.md`.

| ID | Epic | Status | Phase | Approx slice count |
|---|---|---|---|---|
| [E0](agents/epics/E00-spec-and-scaffold.md) | Spec & Scaffold | not-started | Phase 0 | 8 |
| [E1](agents/epics/E01-design-system-and-app-shell.md) | Design System + Persistent App Shell | not-started | Phase 1 | 9 |
| [E2](agents/epics/E02-auth-and-tenancy.md) | Auth Foundation + Tenant Firewall | not-started | Phase 1 | 8 |
| [E3](agents/epics/E03-properties.md) | Property Pipeline + Intake + Detail Hub | not-started | Phase 1 | 7 |
| [E4](agents/epics/E04-assessments-and-compliance.md) | Assessment + Compliance Evaluator | not-started | Phase 1 | 5 |
| [E5](agents/epics/E05-quotes.md) | Quotes | not-started | Phase 1 | 5 |
| [E6](agents/epics/E06-work-orders-and-subs.md) | Work Orders + Subcontractor Assignment | not-started | Phase 1 | 6 |
| [E7](agents/epics/E07-compliance-docs.md) | Compliance Documents (async PDF) | not-started | Phase 1 | 4 |
| [E8](agents/epics/E08-invoices.md) | Invoices | not-started | Phase 1 | 4 |
| [E9](agents/epics/E09-admin-config-hub.md) | Admin Config Hub | not-started | Phase 1 | 9 |
| [E10](agents/epics/E10-contractor-mobile.md) | Contractor / Field Mobile Polish + Field-Only Screens | not-started | Phase 1 | 6 |
| [E11](agents/epics/E11-backend-wiring.md) | Backend Wiring (services + DB) | not-started | Phase 1→2 | 12 |
| [E12](agents/epics/E12-subcontractor-portal.md) | Subcontractor Portal | not-started | Phase 2 | 5 |
| [E13](agents/epics/E13-homeowner-portal.md) | Homeowner Portal | not-started | Phase 2 | 8 |

Total: ~96 stories. Stories are sized so each is mergeable in a single agent
session and produces a visible UI delta.

---

## 5. Per-Slice Definition of Done

Every story must satisfy **all** of the following before being marked complete:

1. **Code lands** behind the agreed file paths in §3.
2. **Top-of-file rationale block** present on every new file >40 lines (D8).
3. **Zod contract** exists in `shared/contracts/` for any new data shape — no
   ad-hoc inline shapes.
4. **MockService method** implemented (E0–E10) or **RealService method**
   implemented (E11+) — never both at once.
5. **Playwright spec** in `tests/e2e/` covering happy path + ≥1 negative.
6. **CI green**: typecheck, eslint, playwright, vitest.
7. **Permission gating** verified — story must explicitly state which roles
   see the new UI and Playwright must prove non-permitted roles do not.
8. **Persistent nav** unaffected: no story may add a layout or replace the
   sidebar/bottom-nav. Nav additions go through `nav.config.ts` only.
9. **Handoff note** at `agents/handoffs/S-YYYY-MM-DD-<n>-<slug>.md` summarizing
   what shipped and what the next agent needs to know.
10. **BUILD_STATUS.md** updated to advance the cursor.

---

## 6. Configuration Inventory (D6 — every item below has an Admin screen)

| Configurable | Owning Epic | Admin Screen |
|---|---|---|
| Compliance standards (materials, vent types, etc.) | E4 | `Settings → Compliance Standards` (existing wireframe 24) |
| Pipeline stages / statuses | E9 | `Settings → Workflow → Statuses` |
| Trade list (roofing, siding…) | E9 | `Settings → Workflow → Trades` |
| Material catalog (for quote line items) | E9 | `Settings → Catalog → Materials` |
| Labor rate defaults | E9 | `Settings → Catalog → Labor Rates` |
| Quote / compliance / invoice PDF templates | E9 | `Settings → Document Templates` |
| User roles + memberships | E9 | `Settings → Users` (existing wireframe 23) |
| Organization profile / GC info | E9 | `Settings → Company` (existing wireframe 12) |
| API keys | E9 | `Settings → Integrations → API Keys` |
| Notification preferences (per user) | E9 | `Profile → Notifications` |
| Feature flags (per tenant) | E9 | `Settings → Feature Flags` (super_admin only) |
| Audit log (read-only viewer) | E9 | `Settings → Audit Log` |
| Org switcher | E9 | top-bar widget for super_admin and multi-org users |

Anything that the BRD or wireframes implies should be tunable but is missing
from this table is a **plan defect** — file an ADR to add it.

---

## 7. How We Manage Build-Out Without Reusing the Boilerplate App

We do not fork [`boilerplate/dashboard/`](boilerplate/dashboard/) (wrong framework — D9).
Instead we adopt the boilerplate's *governance* artifacts and re-implement
project tracking inside this repo with three files:

- [BUILD_PLAN.md](BUILD_PLAN.md) — this file. The roadmap.
- [BUILD_STATUS.md](BUILD_STATUS.md) — the cursor: which epic, which story,
  what's blocked, what's next.
- `agents/handoffs/` — per-session continuity.

Sponsor visibility = read these three locations. No external PM tool required
until we hit Phase 2 scale.

---

## 8. Risks (live)

| Risk | Mitigation |
|---|---|
| FE-first builds UI that the eventual backend can't populate. | D4 MockService satisfies the same Zod contracts the real backend will. Contract drift is a CI failure. |
| Comment-rich code becomes stale. | ADR for every D-level decision; comments reference ADR IDs not narrative. Stale ADR detection added to CI in E11. |
| Demo and real app diverge to the point investors get confused. | Demo is frozen post-E0. Any change to demo requires explicit sponsor request. |
| Permission-gated nav silently regresses. | Playwright matrix runs all roles against every route in E1's slice S9. |
| Multi-tenancy escapes through sloppy service writes. | `requireOrgMembership` is the first line of every service method (TECH §2). Architect-role review on every E11 story. |

---

## 9. Execution Cursor (live)

See [BUILD_STATUS.md](BUILD_STATUS.md). At time of writing this plan:

- Active epic: **E0 — Spec & Scaffold**
- Active story: **E0-S1 — Lift docs into root + write CONTRACTS/DECISIONS/UI-CONTRACTS skeletons**
- Next agent action: scaffold Nuxt 3 project at repo root.

---

*— end of plan —*

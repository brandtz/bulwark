# BULWARK — Copilot Handoff
> Read this file first. It tells you which document to read for what.
> Brandtworks-Enterprises LLC | For GitHub Copilot agents and any AI working on Bulwark
> Status as of handoff: Pre-Phase-0 — no application code yet exists.

---

## What Bulwark Is (One Paragraph)

Bulwark is a multi-tenant vertical SaaS that manages the wildfire retrofit operation for licensed General Contractor firms in Oregon. Customers are GC firms; their customers are homeowners in wildfire hazard zones who need their homes hardened to current standards so their insurance carriers will renew coverage. Bulwark handles the full workflow: property pipeline, on-site assessments against state standards, quotes, work orders, subcontractor coordination, insurance-grade compliance documentation, and invoicing. First operating tenant is the Drew + Matthew partnership in Eastern Oregon. Architecture is multi-tenant from day one; future tenants are other retrofit GC firms across OR / CA / CO / WA.

---

## Document Map — Read In This Order

| # | Document | What It Tells You | When You Read It |
|---|---|---|---|
| 1 | `BULWARK_HANDOFF.md` | This file. Routing. | First, every session. |
| 2 | `CONVENTIONS.md` | The law. File naming, API patterns, auth, errors, audit log, agent behavior, the three-act prompt structure, what agents never do. | Second, every session. Non-negotiable. |
| 3 | `BULWARK_TECH.md` | Stack, multi-tenancy implementation, database conventions, deployment, build order. | Before writing any code. |
| 4 | `BULWARK_BRD.md` | The business. Why this exists, who the partners are, what each phase does. | Once for context. Re-read when scoping a new feature. |
| 5 | `BULWARK_SCREENS_BY_ROLE.md` | Canonical screen inventory. Which screens exist, which user system each belongs to, build priority, spec status. | Before starting work on any screen. |
| 6 | `BULWARK_UX_CONTEXT.md` | The 23 originally-specified screens in detail, plus the Field Type Library (FT-01 through FT-20), navigation shell, cross-cutting interaction patterns. | Before building any frontend screen. |
| 7 | `BULWARK_STYLE_GUIDE.md` | Design tokens — colors, typography, spacing, component patterns. Canonical for every screen. | Before any styling decision. |
| 8 | `BUILD_STATUS.md` | Where the build currently is. Phase, prompt count, blockers, next prompt. | Every session, after the others. |
| 9 | `agents/handoffs/*.md` | Per-prompt handoff notes from prior sessions. | When picking up where the last prompt left off. |

When two documents disagree, the precedence is:
**CONVENTIONS.md → BULWARK_TECH.md → BULWARK_SCREENS_BY_ROLE.md → BULWARK_UX_CONTEXT.md → BULWARK_STYLE_GUIDE.md → BULWARK_BRD.md.**

The BRD is last because it's a business document, not an engineering spec. If the BRD contradicts CONVENTIONS, CONVENTIONS wins and the BRD gets updated.

---

## The Locked Stack (Do Not Re-Litigate)

These decisions are final. If you find yourself wanting to suggest an alternative, stop and re-read this section.

| Layer | Choice |
|---|---|
| Framework | **Nuxt 3** (TypeScript, strict mode) |
| Styling | Tailwind CSS v3 |
| State | Pinia |
| ORM | Drizzle |
| Database (dev) | PostgreSQL 16, **local native, no Docker** |
| Database (staging/prod) | Neon |
| API | Nuxt server routes (Nitro) |
| Session Auth | nuxt-auth-utils |
| JWT Auth | **JOSE only** — `jsonwebtoken` is banned |
| API Key Auth | bcrypt-hashed |
| Validation | Zod (shared client + server) |
| Forms | vee-validate + zod resolver |
| PDF | Puppeteer, **always async** |
| File Storage | Cloudflare R2 |
| Hosting | **Vercel** |
| CI/CD | GitHub Actions, Playwright on every PR |
| Package Manager | pnpm |
| Testing | Playwright (E2E) + Vitest (unit), CODEOWNERS-protected |

**Banned:** Docker (any environment), `jsonwebtoken`, React/Next.js, raw SQL with string interpolation, `pnpm drizzle-kit push` against non-scratch databases, hard deletes, money as float or string, taking `organizationId` from the request body, UPDATE or DELETE against `audit_log`.

---

## The Architecture in One Page

### Multi-Tenancy
- Shared database, `organizationId` column on every tenant-scoped table
- Tenant firewall lives at the **service** layer: `requireOrgMembership(userId, organizationId)` is the first line of every service method touching tenant data
- `organizationId` always comes from the auth context, never the request body

### Roles
- System: `super_admin` (Matthew/BWE only)
- Org: `org_admin`, `org_manager`, `field`, `sub_contractor` (Phase 2), `viewer` (Phase 2)
- **Admin role is a superset.** Contractor / Subcontractor / Homeowner views are permission-gated and mobile-optimized variants of the same underlying screens. Build the Admin version first; the others are restricted views, not net-new builds (with rare exceptions enumerated in `BULWARK_SCREENS_BY_ROLE.md`).

### API Layer Pattern (Four-Layer Rule)
```
Route handler (server/api/)
  ↓ calls
Service class (server/services/)
  ↓ calls
Drizzle ORM (server/db/)
  ↓ queries
PostgreSQL
```
No layer is skipped. No layer reaches past its adjacent layer. Routes are wiring; services are business logic; ORM is data access.

### Errors
Typed only. `NotFoundError`, `AuthorizationError`, `ValidationError`, `ConflictError`, `ExternalServiceError`. All in `server/errors/index.ts`. Do not create new error classes inline. Routes never catch errors — the global handler maps them to HTTP responses.

### Audit Log
Every database write writes an `audit_log` row in the same transaction via `AuditService.log(tx, {...})`. Audit rows are immutable. UPDATE or DELETE against `audit_log` is a critical violation.

### Money
Integer cents. Never float. Never string. The display layer formats.

---

## Build Approach — Frontend-First

Bulwark is built **frontend-first**. This is a deliberate inversion of the usual order.

1. **Phase 0 — Specification only, no code.** All spec docs and Playwright stubs exist before any UI work begins.
2. **Phase 1 — Auth.** This is the only place FE and BE are built simultaneously, because there's no value in mocking auth.
3. **Phase 2+ — Per screen:**
   - Build the FE against contract-shaped mock data
   - Wire the BE to the same contracts
   - QA the screen end-to-end
   - Commit
   - Move to the next screen

The mock data layer in the frontend conforms to the same Zod schemas in `validators/` that the backend will use. When the backend wires in, the mock layer is swapped out — no contract changes are required.

If the frontend needs a contract change, the change is made in `CONTRACTS.md` and `validators/` first, then both sides update. **Never silently diverge from the contract.**

Why FE-first: it lets Matthew steer functionality screen-by-screen as it appears, instead of discovering at integration time that the BE produced data shapes the FE can't consume.

---

## Build Priority — User Systems

| Priority | System | Notes |
|---|---|---|
| P0 | Shared / Foundation | Auth flows, error pages, org switcher. Required before anything else. |
| P1 | **Admin** | The superset role. Build all functionality here first. |
| P2 | **Contractor** | Mostly mobile/tablet variants of Admin screens with permission scoping. Plus a few field-only screens. |
| P3 | **Subcontractor** | Phase 2. Restricted portal — assigned jobs only, no financials. |
| P4 | **Homeowner** | Phase 2. Read-only client portal with document download and Phase 2 Stripe payments. |

Full screen inventory and per-screen build sequence is in **`BULWARK_SCREENS_BY_ROLE.md`**.

---

## The Three-Act Prompt Structure

Every Copilot prompt has three acts. All three complete before commit. None of them are skippable.

| Act | What Happens |
|---|---|
| **Act 1 — Build** | Implement the feature per the prompt and the spec docs. |
| **Act 2 — Role Challenge Reviews** | Architect → Security → QA → UX, in that order, per the tier declared in the prompt header. Each role uses its mandatory checklist. |
| **Act 3 — Arbitration** | Classify findings. Make a merge decision. Modify `PROMPT-[N+1].md` to absorb required remediations. Update `BUILD_STATUS.md`. Commit. |

### Review Tiers (declared in the prompt header)

| Tier | Active Roles | When |
|---|---|---|
| `FULL` | Architect + Security + QA + UX | Auth, assessment, compliance, payments |
| `SECURITY_ONLY` | Architect + Security + QA | All API routes, DB-touching services |
| `SPOT` | Architect + UX | UI-only, config, read-only screens |

### Commit Format
```
PROMPT-[N]: [Module Name] — [APPROVED CLEAN | APPROVED | APPROVED WITH CONDITIONS]

[One line summary of what was built]
[If conditions: "Carries N findings to PROMPT-[N+1]"]
```

### Four Required Artifacts Per Commit
1. Implementation files
2. Modified next prompt file (if remediations carry forward)
3. Updated `BUILD_STATUS.md`
4. Handoff file in `agents/handoffs/`

If any of these four are missing, the session is incomplete.

---

## What You Are NOT Allowed To Do

These are agent-behavior hard rules. Each one is a critical violation if breached.

- Modify files in `tests/e2e/` or `tests/unit/` — tests are CODEOWNERS-protected. You write code that passes them; you do not change the tests.
- Create new error classes outside `server/errors/index.ts`.
- Add routes to `PUBLIC_ROUTES` without human approval.
- Write `console.log` in any committed code — use the structured logger.
- Use `db.execute()` with string interpolation.
- Hard delete any record from any table — soft deletes only.
- Store money as anything other than integer cents.
- Use the `jsonwebtoken` package — JOSE only.
- Add Docker configuration anywhere.
- Use `pnpm drizzle-kit push` against anything except a throwaway scratch database.
- Take `organizationId` from the request body.
- Write `UPDATE` or `DELETE` against `audit_log`.
- Build a backend service before the frontend screen that consumes it (FE-first sequence). The exception is auth in Phase 1.
- Skip Phase 0 spec docs to "save time."
- Suggest React, Next.js, S3, Railway, Render, or `jsonwebtoken` — these were considered and rejected.

---

## Where We Are Right Now

Phase 0 — Pre-Build. The following are **done**:

- All locked architectural decisions
- BRD, TECH, UX_CONTEXT, SCREENS_BY_ROLE, STYLE_GUIDE, CONVENTIONS, this HANDOFF
- 23 of 35 MVP screens specified in `BULWARK_UX_CONTEXT.md`

The following are **needed before any FE prompt runs**:

- Specs for the 12 newly-identified MVP screens (8 Shared + 2 Admin + 2 Contractor) — see `BULWARK_SCREENS_BY_ROLE.md`
- `CONTRACTS.md` — service input/output shapes
- `DECISIONS.md` — architecture decision log
- `UI-CONTRACTS.md` — shared component props and behavior
- Full Drizzle schema (all MVP tables)
- TypeScript domain types in `types/index.ts`
- Zod validation schemas in `validators/`
- `server/errors/index.ts` (error taxonomy)
- All Playwright test stubs (failing — no implementation yet)
- All `.github/ui-specs/[screen].md` files
- All wireframe exports in `agents/wireframes/`
- `BUILD_STATUS.md` (initial state)
- `PROMPT-00-CONTEXT.md` master context file
- Phase 0 prompt files (PROMPT-00 through PROMPT-05)
- Initial repo structure and Vercel + Neon + R2 + GitHub Actions setup

The Master Pre-Build Checklist (an external PDF held by Matthew) is the canonical to-do for Phase 0.

---

## Open Questions Being Tracked

These do not block Phase 0 spec writing. They block Phase 2+ implementation of specific features. See `BULWARK_BRD.md` and `BULWARK_Master_Checklist.pdf` Section 4 for the full list — most are "Waiting on Drew."

- Confirm assessment checklist field labels and order
- Confirm compliant-vs-non-compliant material lists per category (drives the standards config defaults)
- Confirm trade categories used in the field
- Fixed-price retrofit packages or custom quotes per job?
- What does the current insurance reinstatement paperwork ask for? (drives compliance doc template)
- Any county-level variations in wildfire standards?

---

*BULWARK_HANDOFF.md — Version 1.0*
*Maintained by Brandtworks-Enterprises LLC*
*Read this first. Then `CONVENTIONS.md`. Then everything else.*

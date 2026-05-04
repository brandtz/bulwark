# BULWARK — Technical Blueprint
> AI Agent Instruction Manual | Version 2.0 | Bulwark Operations Platform
> Supersedes Version 1.0 — major changes: deployment (Vercel/Neon/R2), auth (JOSE + multi-tier), multi-tenancy, audit log, error taxonomy, FE-first build order. See Section 15 for the full diff.

---

## 1. Stack Overview

| Layer | Technology | Rationale |
|---|---|---|
| Framework | Nuxt 3 | SSR + SPA hybrid; Nitro API built-in; zero-config performance |
| Language | TypeScript (strict) | End-to-end type safety |
| Styling | Tailwind CSS v3 | Utility-first; consistent design system |
| State | Pinia | Native Vue 3 state management |
| ORM | Drizzle ORM | Type-safe, lightweight, fast |
| Database (dev) | PostgreSQL 16, local native | No Docker. Native install on dev machine |
| Database (staging/prod) | Neon serverless Postgres | Branching for staging; serverless scaling for prod |
| API Layer | Nuxt server routes (Nitro) | File-based API, no separate service |
| Session Auth | nuxt-auth-utils | Cookie-backed sessions for the web app |
| JWT Auth | JOSE | Edge-runtime compatible. `jsonwebtoken` is **banned** |
| API Key Auth | bcrypt-hashed keys | Service-to-service auth, GitHub PAT pattern |
| Validation | Zod (shared client + server) | One schema, two consumers |
| PDF Generation | Puppeteer (headless Chrome) | Always async — never blocks API responses |
| File Storage | Cloudflare R2 | S3-compatible, 10GB free, signed URLs only |
| Email (Phase 2) | Resend | 3,000/mo free, transactional only |
| Payments (Phase 2) | Stripe | Card / ACH for homeowner invoices |
| Transcription (Phase 3+) | OpenAI Whisper API | Audio field reports |
| AI Extraction (Phase 3+) | Anthropic Claude API | Transcript → structured property record |
| Hosting | Vercel | Nuxt preset; automatic PR previews; edge-optimized |
| CI/CD | GitHub Actions | Playwright on every PR; blocks merge on failure |
| Package Manager | pnpm | Faster, workspace support |
| Forms | vee-validate + zod resolver | |
| Testing | Playwright (E2E) + Vitest (unit) | Tests written before implementation; CODEOWNERS-protected |

**Banned in this project:** Docker (any environment), `jsonwebtoken`, raw SQL with string interpolation, `pnpm drizzle-kit push` against non-scratch databases, hard deletes, money as float or string.

---

## 2. Multi-Tenancy

Bulwark is multi-tenant from day one. Architecture is **Option A: shared database, `organizationId` column on every tenant-scoped table.**

### Tenant Firewall

The tenant firewall lives at the **service layer**, not the route layer.

- `requireOrgMembership(userId, organizationId)` is called as the first line of every service method that touches tenant data.
- `organizationId` is **never** taken from the request body. Always from the auth context (session or JWT claims).
- Cross-tenant data leaks are a critical violation; the architect role review checks for this on every prompt.

### Role Taxonomy

| Level | Role | Scope |
|---|---|---|
| System | `super_admin` | Matthew / BWE only — visibility across all tenants |
| Org | `org_admin` | Full access within one tenant |
| Org | `org_manager` | Operational access; cannot manage users or billing |
| Org | `field` | Field-only screens; no financial visibility |
| Org | `sub_contractor` | Phase 2 — assigned-jobs-only portal |
| Org | `viewer` | Phase 2 — read-only |

`super_admin` is enforced separately from organization roles. A super_admin acting on tenant data still goes through `requireOrgMembership` for audit purposes, with an explicit override that is logged.

---

## 3. Project Structure

This is the canonical structure. The earlier "`.github/copilot/agents/`" path from v1 is **wrong** — agent files live in `agents/roles/`, per `CONVENTIONS.md`.

```
bulwark/
├── server/
│   ├── api/                    # Nitro API route files
│   │   ├── auth/
│   │   ├── properties/
│   │   ├── clients/
│   │   ├── assessments/
│   │   ├── quotes/
│   │   ├── workorders/
│   │   ├── subcontractors/
│   │   ├── compliance/
│   │   ├── invoices/
│   │   └── jobs/                # Async job status polling
│   ├── services/                # One class per domain
│   │   ├── PropertyService.ts
│   │   ├── ClientService.ts
│   │   ├── AssessmentService.ts
│   │   ├── QuoteService.ts
│   │   ├── WorkOrderService.ts
│   │   ├── SubcontractorService.ts
│   │   ├── ComplianceService.ts
│   │   ├── InvoiceService.ts
│   │   ├── JobService.ts
│   │   ├── AuditService.ts        # Mandatory in every write transaction
│   │   └── ApiKeyService.ts
│   ├── db/
│   │   ├── schema/              # Drizzle table definitions
│   │   │   ├── organizations.ts
│   │   │   ├── users.ts
│   │   │   ├── memberships.ts
│   │   │   ├── sessions.ts
│   │   │   ├── refresh-tokens.ts
│   │   │   ├── api-keys.ts
│   │   │   ├── audit-log.ts
│   │   │   ├── properties.ts
│   │   │   ├── clients.ts
│   │   │   ├── assessments.ts
│   │   │   ├── quotes.ts
│   │   │   ├── work-orders.ts
│   │   │   ├── subcontractors.ts
│   │   │   ├── compliance-docs.ts
│   │   │   ├── invoices.ts
│   │   │   └── jobs.ts
│   │   ├── index.ts             # Drizzle client export
│   │   └── migrations/          # Auto-generated, never manually edited
│   ├── errors/
│   │   └── index.ts             # Error taxonomy — never add inline
│   ├── middleware/
│   │   ├── 01.auth.ts           # Auth resolution
│   │   └── 02.requestLogger.ts  # Request logging
│   ├── plugins/
│   │   └── errorHandler.ts      # Global error handler
│   ├── utils/
│   │   ├── auth/
│   │   │   ├── session.ts
│   │   │   ├── jwt.ts            # JOSE only
│   │   │   ├── apiKeys.ts
│   │   │   └── requireAuth.ts
│   │   ├── tenancy.ts            # requireOrgMembership firewall
│   │   ├── validation.ts
│   │   ├── pagination.ts
│   │   ├── rateLimit.ts
│   │   ├── storage.ts            # Cloudflare R2 signed URLs
│   │   ├── compliance.ts         # OR wildfire standards evaluation
│   │   ├── pdf.ts                # Puppeteer wrapper, async only
│   │   ├── logger.ts             # Structured logger
│   │   └── env.ts                # Zod-validated env vars
│   └── types/
├── pages/                        # Vue file-based routes
├── components/
│   └── ui/                       # Base components per UI-CONTRACTS.md
├── composables/
├── stores/                       # Pinia
├── validators/                   # Zod schemas, shared server + client
├── types/
├── assets/
│   └── templates/
│       ├── compliance-doc.html
│       └── quote.html
├── tests/
│   ├── e2e/                      # Playwright — CODEOWNERS-protected
│   └── unit/                     # Vitest — CODEOWNERS-protected
├── .github/
│   ├── CODEOWNERS
│   ├── workflows/                # GitHub Actions
│   ├── ui-specs/                 # Per-screen UI specs
│   └── wireframes/               # Exported wireframe images
├── agents/
│   ├── prompts/                  # Numbered execution prompt files
│   ├── roles/                    # architect.md, security.md, qa.md, ux.md, etc.
│   ├── handoffs/                 # Post-prompt handoff notes
│   └── context/                  # Cross-cutting context (conventions, skills, integrations)
├── BULWARK_BRD.md
├── BULWARK_TECH.md               # This file
├── BULWARK_UX_CONTEXT.md
├── BULWARK_SCREENS_BY_ROLE.md
├── BULWARK_STYLE_GUIDE.md
├── CONVENTIONS.md
├── CONTRACTS.md
├── DECISIONS.md
├── UI-CONTRACTS.md
├── BUILD_STATUS.md
├── drizzle.config.ts
└── nuxt.config.ts
```

---

## 4. Database Schema (Conventions)

### Universal Conventions

- All tables: `id` (uuid, default `gen_random_uuid()`), `created_at`, `updated_at`, `deleted_at` (nullable, for soft delete)
- All tenant-scoped tables: `organizationId` (uuid, FK to `organizations`)
- Money: integer cents only. Never float. Never string. The display layer formats.
- Status fields: PostgreSQL enums, never free-form strings
- Soft deletes: `deletedAt` set; row stays. No hard deletes ever.
- Audit log: every write to a tenant table writes a row to `audit_log` in the same transaction

### Tenant-Scoped Tables (organizationId required)

`properties`, `clients`, `assessments`, `quotes`, `work_orders`, `subcontractors`, `compliance_docs`, `invoices`, `api_keys`, `audit_log`

### System Tables (no organizationId)

`organizations`, `users`, `memberships` (the user↔org join), `sessions`, `refresh_tokens`, `jobs` (async job queue)

### Schema Example

```typescript
// server/db/schema/properties.ts

export const propertyStatusEnum = pgEnum('property_status', [
  'lead', 'contacted', 'assessment_scheduled', 'assessed',
  'quoted', 'approved', 'in_progress', 'inspection_ready',
  'complete', 'declined'
]);

export const properties = pgTable('properties', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  parcelId: text('parcel_id'),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').default('OR'),
  zip: text('zip'),
  county: text('county'),
  hazardZone: text('hazard_zone'),
  status: propertyStatusEnum('status').default('lead'),
  ownerName: text('owner_name'),
  ownerEmail: text('owner_email'),
  ownerPhone: text('owner_phone'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  orgIdx: index('properties_org_idx').on(t.organizationId),
  statusIdx: index('properties_status_idx').on(t.organizationId, t.status),
}));
```

(Other table definitions follow the same pattern. See `CONVENTIONS.md` for the full list and indexing rules.)

---

## 5. Auth

Three authentication paths, one middleware.

| Path | Used By | Mechanism |
|---|---|---|
| Session + Cookie | Web app users (Matthew, Drew, sub-contractors, homeowners) | `nuxt-auth-utils`, HTTP-only cookie |
| JWT (Bearer) | Mobile / PWA / external app clients | JOSE-signed, short-lived access + long-lived refresh |
| API Key | Service-to-service | bcrypt-hashed, prefix shown in UI, raw key shown once |

`requireAuth(event)` is the **first line** of every API route handler. It resolves the auth path, attaches `AuthContext` to the event, and rejects unauthenticated requests with `AuthorizationError`.

`requireOrgMembership(userId, organizationId)` is the **first line** of every service method touching tenant data.

API key scopes (defined upfront, enforced everywhere):
- `properties:read`, `properties:write`
- `assessments:read`, `assessments:write`
- `docs:generate`, `docs:read`
- `admin`

---

## 6. Error Taxonomy

All errors are typed. Agents do not create new error classes inline. The full taxonomy lives in `server/errors/index.ts`.

```typescript
class BulwarkError extends Error { ... }
class NotFoundError extends BulwarkError { ... }       // 404
class AuthorizationError extends BulwarkError { ... }  // 401/403
class ValidationError extends BulwarkError { ... }     // 400
class ConflictError extends BulwarkError { ... }       // 409
class ExternalServiceError extends BulwarkError { ... } // 502
```

Routes never catch errors themselves — the global `errorHandler.ts` plugin maps typed errors to HTTP responses with structured JSON bodies.

---

## 7. Audit Log

Every database write writes an audit log row in the same transaction. This is a hard rule.

```typescript
await db.transaction(async (tx) => {
  const [updated] = await tx.update(properties)...returning();
  await AuditService.log(tx, {
    organizationId,
    userId,
    action: 'property.updated',
    resourceType: 'property',
    resourceLabel: updated.address,    // human-readable, never raw UUID
    previousState,
    nextState,
  });
});
```

Audit log rows are immutable. UPDATE or DELETE against `audit_log` is a critical violation.

---

## 8. Compliance Logic

```typescript
// server/utils/compliance.ts
// Oregon Wildfire Hardening Standards — ORS/OAR reference

const COMPLIANT_ROOF_MATERIALS = ['metal', 'tile', 'class_a_asphalt'];
const COMPLIANT_SIDING_MATERIALS = ['fiber_cement', 'stucco', 'metal', 'masonry', 'brick'];
const COMPLIANT_EAVE_TYPES = ['enclosed', 'boxed'];
const COMPLIANT_VENT_TYPES = ['ember_resistant'];

export function evaluateCompliance(assessment: AssessmentInput): ComplianceResult {
  const items: UpgradeItem[] = [];

  if (!COMPLIANT_ROOF_MATERIALS.includes(assessment.roofMaterial)) {
    items.push({
      field: 'roofMaterial',
      currentValue: assessment.roofMaterial,
      requiredValue: 'Class A fire-rated material (metal, tile, or Class A asphalt)',
      standardRef: 'OAR 629-044-1030'
    });
  }
  // ... siding, eaves, vents

  return {
    overallCompliant: items.length === 0,
    nonCompliantItems: items.map(i => i.field),
    requiredUpgrades: items
  };
}
```

The compliant-material lists are configurable per tenant via `SCREEN 23 — Compliance Standards Config`. The defaults above are the Oregon baseline; tenants may add or remove options as standards evolve and as Drew confirms ground truth.

---

## 9. PDF Generation (Always Async)

```
1. Client calls POST /api/compliance/generate
2. Service creates a job row, returns { jobId }
3. Background worker (Nitro task) generates PDF via Puppeteer, stores in R2
4. Client polls GET /api/jobs/[jobId] until status: 'complete'
5. Response includes signed R2 URL (15-minute TTL)
```

PDF generation **never** blocks an API response. Same pattern applies to audio transcription in Phase 3+.

---

## 10. Performance Requirements

- All authenticated page loads: < 300ms (Nuxt SSR + Nitro)
- API responses (p95): list < 150ms, detail < 100ms, write < 200ms, async-job-create < 200ms
- Initial JS bundle: < 200KB gzipped; per-route chunk: < 50KB
- All list endpoints paginated (default 25, max 100)
- No N+1 queries — eager-load with Drizzle `with`
- Queries > 100ms logged at warn; > 500ms logged at error and require an index

Full performance budgets and enforcement rules in `CONVENTIONS.md` Section 10.

---

## 11. Deployment

```
Vercel (Nuxt preset)
  ├── Production:  bulwark.app (or assigned domain)
  ├── Staging:     auto-deployed per branch (PR previews)
  └── Branch deploys: every PR gets a unique URL

Neon (Postgres)
  ├── bulwark-prod    (production database)
  └── bulwark-staging (staging database, branching from prod schema)

Cloudflare R2
  └── bulwark-files   (signed URLs only; no public buckets)

Resend (Phase 2)
  └── Transactional email
```

### Environment Variables

```
DATABASE_URL=
NUXT_SESSION_SECRET=
JWT_SECRET=
JWT_ACCESS_EXPIRY=          # e.g. "15m"
JWT_REFRESH_EXPIRY=         # e.g. "30d"
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_KEY=
CLOUDFLARE_R2_SECRET=
RESEND_API_KEY=             # Phase 2
STRIPE_SECRET_KEY=          # Phase 2
OPENAI_API_KEY=             # Phase 3+
ANTHROPIC_API_KEY=          # Phase 3+
```

All env vars validated at startup via Zod. The app refuses to start if any required var is missing.

---

## 12. Phase 3+ — Audio Field Report Pipeline

```
Mobile Field App (PWA)
  → Hold-to-record button → MediaRecorder API → audio/webm blob
  → POST /api/assessments/audio { propertyId, audioBlob }

Server: /api/assessments/audio.post.ts
  → Upload blob to R2
  → Create job row, return { jobId } (async)
  → Background: POST to OpenAI Whisper API → transcript string
  → POST to Claude API with structured-extraction system prompt
  → Parse JSON response → pre-fill assessment record
  → Mark job complete

Client
  → Polls /api/jobs/[jobId] until complete
  → Display pre-filled assessment form
  → GC reviews, corrects if needed, taps Confirm
  → Assessment saved
```

### Schema-to-Speech Mapping

Field names are designed to match natural spoken language. This is not cosmetic — it makes the Phase 3+ Claude extraction reliable.

| Field | Contractor says |
|---|---|
| `siding_material` | "The siding is T1-11 wood" |
| `siding_sqft_south` | "south face is about 400 square feet" |
| `roof_material` | "asphalt shingle roof" |
| `roof_age_years` | "probably from 2004" |
| `eave_type` | "eaves are open" |
| `vent_type` | "standard vents, not ember resistant" |

---

## 13. Build Order — Frontend-First

Bulwark is built **frontend-first**. The original v1 build order (DB schema → auth → CRUD → ...) is superseded.

### Why FE-First

Building the backend first repeatedly produces data shapes the frontend can't consume. By the time integration happens, both sides have made assumptions that conflict. FE-first lets Matthew steer functionality screen-by-screen as it appears.

### The Sequence

1. **Phase 0 — Specification (no app code)**
   - All Phase 0 deliverables per `BULWARK_Master_Checklist.pdf` Section 2: CONTRACTS, CONVENTIONS, DECISIONS, UI-CONTRACTS, full Drizzle schema, error taxonomy, Zod validators, Playwright stubs.
   - Every screen has a `.github/ui-specs/[screen].md` file before its frontend prompt runs.
2. **Phase 1 — Foundation (FE + BE together)**
   - Auth must work end-to-end before anything else. This is the only place BE and FE are built simultaneously, because there's no real auth-flow value in mocking it.
3. **Phase 2 — Admin core workflow (FE first, then BE per screen)**
   - Each screen: build the FE against contract-shaped mock data → wire BE → QA the screen → commit.
   - Order per `BULWARK_SCREENS_BY_ROLE.md` Phase 2.
4. **Phase 3 — Admin supporting screens** — including the dashboard (which now has real data to display)
5. **Phase 4 — Contractor specialization**
6. **Phase 5+ — Subcontractor portal, Homeowner portal, Phase 3 features**

The risk of FE-first is building a UI the backend can't populate. This is mitigated by enforcing Phase 0 spec-first — the FE builds against contracts, not vibes.

### Build Environment

- VS Code + GitHub Copilot agentic AI team
- Three-act prompt structure (Build → Role Reviews → Arbitration) per `CONVENTIONS.md` Section 12
- Review tiers: FULL / SECURITY_ONLY / SPOT, declared per prompt
- BUILD_STATUS.md updated after every prompt; phone-readable

---

## 14. GitHub Copilot Agent Roles

Agent role files live in `agents/roles/`. Each agent reads `agents/context/` and the four root spec docs (`CONVENTIONS.md`, `CONTRACTS.md`, `DECISIONS.md`, `UI-CONTRACTS.md`) before any prompt.

The agent role definitions, three-act prompt structure, review tiers, and arbitration rules all live in `CONVENTIONS.md` Section 12 — that file is canonical. This document only points at it.

---

## 15. Changes from Version 1.0

For posterity:

| Area | v1.0 | v2.0 |
|---|---|---|
| Deployment | Railway / Render | Vercel + Neon + Cloudflare R2 |
| File storage | Local disk → S3 (Phase 2) | Cloudflare R2 from MVP |
| JWT library | (not specified) | JOSE only — `jsonwebtoken` banned |
| Roles | `'admin' \| 'gc' \| 'sub'` | `super_admin` + `org_admin / org_manager / field / sub_contractor / viewer` |
| Multi-tenancy | Not in scope | In scope from MVP — Option A (shared DB, organizationId) |
| Audit log | Not mentioned | Mandatory in every write transaction |
| Error taxonomy | Not mentioned | Typed only, in `server/errors/index.ts` |
| Build order | Backend-first (DB → auth → CRUD) | Frontend-first (spec → FE → BE per screen) |
| Agent file location | `.github/copilot/agents/` | `agents/roles/` |
| Docker | Allowed | Banned in all environments |

---

*BULWARK_TECH.md — Version 2.0*
*Maintained by Brandtworks-Enterprises LLC*

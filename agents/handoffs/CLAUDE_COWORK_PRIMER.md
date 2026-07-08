# Bulwark — Onboarding Primer for Claude Cowork

Read this before doing anything else. It's organized so you can trim if needed, but all sections are useful for an agent about to work autonomously in this repo.

---

## 1. What this project actually is

**Bulwark** is a production SaaS platform for a wildfire-hardening retrofit contracting business operating in Eastern Oregon's WUI (wildland-urban interface) zones. Insurers are non-renewing policies on homes with combustible siding/roofing/vents; Oregon code defines exactly what "hardened" means; Bulwark is the operations backbone that lets a small GC run the full lifecycle — lead → assessment → quote → work order/subs → compliance documentation → invoice/payment — and hand the homeowner a signed compliance package their insurer will accept.

Two related but separate things exist in this repo:
- **The software product** (`bulwark/` — a Nuxt 3 app). This is what you'll be building.
- **The business context** ([bulwark/docs/BULWARK_BUSINESS_CONTEXT.md](../../docs/BULWARK_BUSINESS_CONTEXT.md)) — background only, not code to touch.

There's also a static marketing/demo site at [bulwark/demo/](../../demo/) (Netlify-deployed, no build step) — unrelated to the real app, don't confuse the two.

## 2. Stack

- **Nuxt 3** (SSR+SPA hybrid), TypeScript strict, **Nitro** server routes under `server/api/`
- **Drizzle ORM** + PostgreSQL (local native Postgres in dev, Neon planned for prod)
- **Zod** contracts shared between client/server (`shared/contracts/`)
- **Tailwind CSS**, Vue 3 composition API, `app/` directory structure (pages/components/composables/layouts/middleware/plugins)
- **pg-boss** for async jobs (Puppeteer PDF generation, compliance docs), Cloudflare R2 for object storage
- **Playwright** (e2e) + **Vitest** (unit/integration), pnpm package manager
- Auth: `nuxt-auth-utils` sessions + JOSE (jsonwebtoken is banned)
- Money is always integer cents — never float/string.

Package manager is **pnpm**. Key scripts (run from `bulwark/`): `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset` (dev-only, localhost-gated).

## 3. Architecture essentials an agent must respect

- **Multi-tenant, shared DB.** Every tenant-scoped table has `organizationId`. The tenant firewall is `assertSameTenant(resolver, organizationId)` called at the top of **every** service method that touches tenant data — this lives at the service layer, not routes. (Docs still reference an old name `requireOrgMembership`/`server/utils/tenancy.ts` — **that file does not exist**; it's stale-doc drift, tracked in L07-S6.)
- **Real vs mock services.** Almost every domain has a `*.real.ts` service (in `server/services/`) and a mock counterpart (`shared/mocks/`) satisfying the same contract. `BULWARK_BACKEND=real` is the default now (ADR-0015); mock is an explicit opt-in for offline dev/demo only. Production fails closed against mock.
- **RPC dispatcher pattern.** Client calls go through an h3 RPC dispatcher + a client-side services proxy (`useService(...)`) rather than one route per action.
- **Contracts first.** Every new shape gets a Zod schema in `shared/contracts/`. No inline shapes.
- **Roles (7 today):** `super_admin`, `org_admin`, `org_manager`, `field`, `sub_contractor`, `viewer`, plus `homeowner` (property-scoped, not org-scoped). An 8th role — `insurance_representative` — is planned (L15), not yet built.
- **Portals:** Admin (web), Field (PWA), Subcontractor, Homeowner exist. Insurer portal is net-new/planned.
- **Storage:** pluggable driver (`fs` for dev/test, `R2` for prod) — this is being actively hardened right now (see §5).
- **Audit log:** every tenant-data write goes through `withAudit(...)` in the same transaction.
- **Soft deletes only** (`deletedAt`), never hard `DELETE`.
- **Labels/pipelines/events**: status strings, labels, and domain events are data-driven (namespace/defaults pattern), not hardcoded — see [CONVENTIONS.md](../../CONVENTIONS.md) for the ADR-0014/16/17 patterns before touching status enums, label strings, or event emission.

## 4. Where things live (map)

```
bulwark/
  app/              — Nuxt pages/components/composables/layouts/middleware/plugins
  server/
    api/            — Nitro routes (thin — mostly RPC dispatcher + a few real handlers)
    services/       — one *.real.ts per domain (property, quote, work-order, invoice, storage/, etc.)
    db/             — Drizzle schema + migrations
    jobs/           — pg-boss job handlers + worker.ts
    middleware/, plugins/, utils/
  shared/
    contracts/      — Zod schemas (source of truth for shapes)
    mocks/          — mock service implementations (parity with real)
    events/, pipelines/, labels/, auth/, utils/
  agents/
    epics/          — L01–L20 epic specs (current work breakdown, READ THESE)
    decisions/      — ADR-0001..0010+ (architecture decisions, current v2 set)
    handoffs/       — session handoff notes (historical, mostly v1)
    archive/        — old v1 plan/status/epics — historical reference only, not active
  docs/             — BRD, tech blueprint, UX/style guide, business context, RUNNING.md
  tests/            — e2e (Playwright), integration, unit (Vitest)
```

**Live-state files to read first, every session:**
1. [bulwark/BUILD_STATUS.md](../../BUILD_STATUS.md) — the cursor. What's actively in progress and what's next.
2. [bulwark/BUILD_PLAN.md](../../BUILD_PLAN.md) — the master plan, waves, quality gates, locked decisions.
3. [bulwark/PRODUCTION_GAP_REGISTER.md](../../PRODUCTION_GAP_REGISTER.md) — the evidence base: every known gap, severity, owning epic.
4. Relevant `agents/epics/L<NN>-*.md` for whichever epic is active.

## 5. Work already built

The app is a **feature-complete pre-production build**: 42+ services, all 4 core role portals, ~140 e2e tests, real auth (sessions + MFA), real Postgres persistence, real compliance-doc PDF pipeline (Puppeteer via pg-boss), real quote/work-order/invoice/subcontractor/inspection flows, tenant firewall, audit log, event bus, status pipelines, labels system.

The project is now in a **second phase ("v2" / Production Launch)**, targeting a real first-customer go-live (real GC org, real money via Stripe, a new insurer role, enterprise non-functionals: security/a11y/perf/observability). This phase reset the plan on 2026-06-30 — 15 old epics + 37 old ADRs were archived to `agents/archive/`, and a fresh 20-epic **L-series** plan (L01–L20) was authored, organized into 6 waves, front-loading autonomous (no-secret-needed) work.

**Completed so far in the v2 phase (Wave 1, epic L01 — Object Storage):**
- **L01-S1**: pluggable storage driver interface (`server/services/storage/`), `FsDriver` (dev, HMAC-signed local URLs), `R2Driver` (S3-compatible presigned URLs), env-based driver selection failing closed to R2 in prod.
- **L01-S2**: presign-upload / presign-download / **finalize-upload** endpoints + authz policy, wired into the storage rate-limit rules. A skeptic review caught a real P0 (presigned PUT can't enforce body size) — fixed via server-side `finalize` that HEADs the object and enforces real size/content-type.
- **L01-S3**: production guard (`assertStorableUrlOrKey`) rejecting `data:`/`local://`/`blob:` persisted URLs in prod, wired into photos/attachments/branding logo/COI file, with avatars+signatures **intentionally excluded** (they're meant to stay inline data URLs, ≤48KB).

**Next up:** L01-S4 — storage health check endpoint + legacy-asset report (admin-only).

## 6. Work yet to build (the wave plan)

| Wave | Epics | Focus |
|---|---|---|
| 1 (in progress) | L01 (storage) → L02 (migrate uploads to storage), L04 (job hardening) → L05 (scheduled jobs), L06 (data layer/indexes), plus "gate substrate": L07-S1 (CSRF), L07-S3 (tenant-firewall test), L09-S2 (axe-core), L10-S1 (Lighthouse) | Foundations + the CI gates later stories are held to |
| 2 | L07 (security: CSRF, MFA policy, SAST), L08 (observability: Sentry, metrics, health), L03 (comms fail-loud email/SMS) | Safety & signals |
| 3 | L09 (a11y WCAG 2.1 AA), L10 (perf budget), L19 (compliance multi-state seam — de-hardcode Oregon) | Quality |
| 4 | L11 (doc completeness — homeowner invoice PDF etc.), L12 (settings persistence), L13 (portal depth), L15 (insurer role/portal) | Surfaces |
| 5 | L14 (Stripe payments — test-mode autonomous) | Money |
| 6 | L16 (Postgres prod cutover), L17 (deploy/runbook), L18 (legal — human-gated), L20 (launch QA gate) | Launch |

**Known BLOCKER (functional, not just launch-risk):** GDPR account-purge cron exists as code but is **never scheduled** — owned by L05.

**Notable confirmed gaps** (full detail in [PRODUCTION_GAP_REGISTER.md](../../PRODUCTION_GAP_REGISTER.md)): no Stripe integration at all yet (manual ledger only); no insurer role/portal exists at all (roles = exactly 7 today); no CSRF token (relies on SameSite=Lax only); no Sentry/error tracking; account-purge & COI-expiry jobs unscheduled; quote/invoice numbering has a race condition (COUNT+LIKE, no UNIQUE constraint); accessibility bug where Field layout's Inspect/Photos/Notes tabs all route to the same page; no composite indexes on hot tables.

**Human/secret-gated items** (build credential-ready now, don't block on them): Cloudflare R2 keys, email/SMS provider keys (Resend/Twilio), Stripe keys+webhook secret, managed Postgres URL, Sentry DSN, legal copy, production domain/TLS.

## 7. Quality bar (non-negotiable per story)

Zod contract for any new shape → real service + mock parity → tenant-firewall test → Vitest (unit) + Playwright (happy + ≥1 negative + permission-gate) → typecheck/eslint/vitest/e2e green → CSRF on state-changing routes → audit events on new write paths → docs stay truthful (no stale header comments) → `BUILD_STATUS.md` cursor advanced + a handoff note in `agents/handoffs/` at session end.

The review pattern that's worked well in this repo: after finishing a story, run an adversarial "skeptic" sub-agent pass demanding file+line evidence for every finding, verify each finding against source before reworking, only commit after a clean re-review.

## 8. Traps / lessons already paid for (don't repeat)

- **Vite bundles `node:crypto` into client code** if any client-side plugin/composable has a *static* top-level import that transitively reaches `shared/mocks/*`. This silently kills all Vue event handlers on hydration with zero build error (only a browser console warning). Fix pattern: dynamic `import()` inside the mock-only branch. If buttons stop responding in dev, check the browser console for `node:crypto`/`node:fs` page errors first.
- **Presigned PUT URLs cannot bind body size** — validating the client-declared `sizeBytes` at presign time is not enforcement. Enforce at the boundary where bytes actually land (server-side `finalize` that HEADs the real object). Same logic applies to any future offloaded/re-fetched resource.
- **"Reject placeholder URL in prod" guards must be classified per-column**, not applied blanket. Some fields (avatars, signatures) are *intentionally* inline `data:` URLs (their permanent form, ≤48KB) — guarding them breaks production. Only guard fields whose intended prod representation is a storage key/http(s) URL.
- **`data:` scheme matching must be case-insensitive and whitespace-trimmed** (RFC 2397) — `startsWith('data:')` alone is bypassable.
- Finalize is TOCTOU-able: a presigned PUT is reusable until TTL expiry, so an object can theoretically be overwritten after finalize passes. Mitigated by short TTL (300s); a full fix (etag pinning / copy-on-finalize) is still a blocking precondition noted before L02 wires real consumers.
- Docs drift from code regularly (stale ADR references, phantom files like `server/utils/tenancy.ts`) — don't trust prose in docs without grepping the actual source first.

## 9. Suggested first actions for a new agent session

1. Read [bulwark/BUILD_STATUS.md](../../BUILD_STATUS.md) to confirm the current active story hasn't moved past L01-S4.
2. Read the active epic file in `bulwark/agents/epics/` fully before writing code.
3. Check `git log --oneline -20` in `bulwark/` to confirm HEAD matches what BUILD_STATUS claims.
4. Run `pnpm typecheck && pnpm lint && pnpm test:unit` in `bulwark/` before starting, to get a clean baseline.
5. Follow the per-story Definition of Done in [BUILD_PLAN.md §5](../../BUILD_PLAN.md) exactly — it's the actual acceptance bar this repo's history holds agents to.

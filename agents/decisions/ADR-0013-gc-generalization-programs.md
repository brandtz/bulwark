# ADR-0013 — GC generalization via the Program model

- **Status:** Accepted
- **Date:** 2026-05-14
- **Wave:** Phase 1 Hardening / EH-A / W1-1
- **Related:** ADR-0002 (multi-tenant shared DB), ADR-0004 (mock service pattern), ADR-0008 (rich comments).

## Context

Bulwark is being repositioned from "the WUI wildfire app" to a **general
contractor field-service platform**. The wildfire retrofit use case must
ship as the **first** program but Acme Restoration and every other GC
must be able to add programs (Roof Replacement, Kitchen Remodel, Solar,
Tenant Improvement, etc.) **without** a code change to the platform.

The legacy model encoded "wildfire" into screen titles, mock data, and
service contracts. Generalization required a first-class taxonomy.

## Decision

Introduce a **Program** entity owned by each tenant.

- `programs` table — `(organizationId, slug)` unique, `kind ∈
  {inspection_program, service_program}`, plus per-program defaults
  (color, icon, sort order, default trade slots, pricing defaults).
- `program_memberships` — many-to-many join from a Program to any
  domain entity (`property | quote | work_order`), using a free-text
  `entityType` discriminator. The same property can belong to multiple
  programs at once.
- One **builtin** seeded program per org: **Wildfire Retrofit**
  (`is_builtin=true`). Builtins can be deactivated or reordered but
  cannot be hard-deleted, because today's evaluator + standards are
  coded against the `wildfire-retrofit` slug.
- Per-program template / standard / compliance-doc-template FKs are
  defined **nullable today**, ready for W2-2 to populate without
  another migration.
- Admin UI under `/settings/programs` (gated to `ROLE_GROUPS.admin`).
- Mock + real service implementations behind the existing
  `BulwarkServices` factory, called via `useService('program')`.

## Consequences

**Positive**
- "Wildfire" is just data now. New programs are admin-created; nothing
  in the platform code mentions a specific program kind.
- Multi-program properties become a single membership-row insert — no
  schema migration per new program.
- W2-2 (inspection template engine), W1-3 (pipeline editor), and the
  homeowner portal (E13) all key off the same Program rows.

**Trade-offs**
- Slightly more SQL: every quote/WO scaffolding read may need a
  membership join.
- Slug-based identity inside a tenant — admins must pick a slug they
  can live with. The contract validates kebab-case.
- The `entityType` column is free-text on purpose (see ADR-0008 rich
  comments in `program_memberships.ts`); a Postgres enum would force a
  migration every time we extend programs to a new domain.

**Migration**
- `pnpm db:generate` produces `server/db/migrations/0002_*` adding
  `programs` + `program_memberships` and the `program_kind` enum.
- `pnpm db:seed` inserts one Wildfire Retrofit program per demo org;
  the seed is idempotent (wipe-and-replace within the demo orgs only).

## Alternatives considered

1. **Verticals as separate codebases.** Rejected: fundamentally
   incompatible with the multi-tenant shared-DB stance from ADR-0002
   and would 10× the operational burden.
2. **`property.program` enum column.** Rejected: properties already
   commonly span programs (a wildfire retrofit AND a roof job on the
   same house), and adding a program would be a schema migration.
3. **Global catalog + per-org "enabled" rows.** Rejected: couples one
   GC's program list to every other GC's — wrong shape for tenancy.

## Hooks for downstream waves

- **W1-3** consumes `programs.defaultTradeSlots` for the pipeline
  editor and `programs.pricingDefaults` for the quote builder.
- **W2-2** populates `inspectionTemplateId`, `standardSetId`, and
  `complianceDocTemplateId` (already nullable on the row).
- **EH-B / W1-2** branding/labels apply per-program copy (e.g. button
  labels that change between Wildfire and Roofing).

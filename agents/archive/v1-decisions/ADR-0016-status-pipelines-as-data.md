# ADR-0016 — Status Pipelines as Runtime-Editable Data

**Status:** Accepted (2026-05-14, Wave 1B / EH-H / W1-3)
**Supersedes:** none. Companion to [ADR-0014 — CMS Label Registry](ADR-0014-cms-label-registry.md).

## Context

Bulwark's six core entities (`property`, `quote`, `work_order`, `invoice`,
`compliance`, `job`) each have a status enum defined in `shared/contracts/*.ts`
and rendered through `StatusBadge` and `PipelineColumn` components. Two prior
ADRs constrain this surface:

- [ADR-0006](ADR-0006-config-screens-mandatory.md) — every domain that has
  configuration MUST be runtime-editable. Hard-coded enums + buried switch
  statements are a deal-breaker.
- [ADR-0014](ADR-0014-cms-label-registry.md) — user-facing copy lives in the
  `labels` table; defaults in `shared/labels/defaults.ts`. **Labels are
  presentation, not structure.**

What labels DO NOT solve:
1. Which statuses exist for an entity.
2. Which order they render in (the visual pipeline).
3. Which transitions are permitted (e.g. quote `draft → accepted` should be
   blocked because no one sees the quote).
4. Initial / terminal markers (used by background reconciliation jobs).

W1-4 (Workflow guard) consumes the transition rules to gate UI status menus
and server `updateStatus` calls. W1-4 cannot proceed without this slice.

## Decision

Status pipelines are **runtime-editable data**, versioned per-org per-entity,
with a `canTransition()` predicate consumed by writers.

### Schema

Two tables in the tenant-scoped tier:

- `status_pipelines (id, organization_id, entity_type, version, is_active, audit)`
  unique on `(organization_id, entity_type, version)`.
- `status_pipeline_nodes (id, pipeline_id, slug, label_key, color, description,
  sort_order, is_initial, is_terminal, allowed_transitions jsonb<string[]>, audit)`
  unique on `(pipeline_id, slug)`.

`entity_type` is a Zod enum of exactly six values. A pipeline owns N nodes;
nodes encode their permitted next-slugs as a JSONB string array (NOT a join
table — transitions are small and orthogonal to the rest of the schema).

### Versioning

`save()` always creates a NEW pipeline row at `version = max(prior) + 1` and
flips `is_active` so the new version replaces the prior one atomically (within
a single `withAudit` transaction). Prior versions are retained read-only for
audit replay. This avoids in-place edits losing history mid-day if a sponsor
saves twice.

### Contract surface

```ts
interface IStatusPipelineService {
  getActive(input: { organizationId; entityType }): Promise<StatusPipelineFull | null>
  list(input: { organizationId }): Promise<{ rows: StatusPipeline[] }>
  save(input: StatusPipelineSaveInput): Promise<StatusPipelineFull>
  bootstrap(input: { organizationId; entityType }): Promise<StatusPipelineFull>
  canTransition(input: { organizationId; entityType; fromSlug; toSlug }):
    Promise<{ allowed: boolean; reason?: string }>
}
```

`canTransition` is the W1-4 hook. It returns a structured `{allowed,reason}`
shape instead of throwing so callers can branch UI without try/catch noise.

### Defaults

`shared/pipelines/defaults.ts` exports `DEFAULT_PIPELINES` covering every
entity. The defaults' slug-set is a superset of the Zod status enums — unit
tests assert "every enum value appears in the default pipeline" so a fresh
org never references a slug the UI can't render.

`bootstrap()` is idempotent. The seed script + mock service IIFE both call it
to guarantee a usable starting state.

## Relationship to ADR-0014 (Labels)

| Surface          | Owned by         | Notes                                          |
| ---------------- | ---------------- | ---------------------------------------------- |
| Slug, color, transitions, sort | `status_pipelines` | Structure       |
| Display copy     | `labels`         | `labels[status.<entity>.<slug>]`               |
| Renderer         | `StatusBadge`    | Reads node for color, label for text           |

A pipeline node's `label_key` is the lookup key into the labels table — the
two systems remain decoupled but converge in the renderer.

## Alternatives rejected

- **Keep enums hard-coded, add an "extra statuses" overlay table.** Rejected —
  every status path then has two sources of truth and `canTransition` becomes
  a UNION between enum order and overlay order.
- **One global pipeline, sponsors override per-org.** Rejected — sponsors
  routinely add domain-specific intermediate states (e.g. `awaiting_permit`).
  Per-org from day one matches W1-1 + W1-2.
- **Store transitions as a separate `pipeline_transitions` join table.**
  Rejected — N=6 entities × ~10 nodes × ~3 transitions/node ≈ 180 rows per
  org; JSONB inside the node row is simpler and the access pattern always
  reads the whole pipeline at once.
- **Use the audit log to replay prior versions instead of new rows.**
  Rejected — audit replay is intentionally lossy (squash on retention) and
  the pipeline is small enough that keeping every version is cheap.

## Consequences

- **Tenant firewall:** every method takes `organizationId` and asserts it via
  the standard resolver — same pattern as `MockProgramService` and
  `MockLabelService`.
- **W1-4 hook:** consumer code (UI status menus, `updateStatus` mutations)
  calls `services.statusPipeline.canTransition({...})` before commit. A `false`
  result surfaces `reason` to the toast.
- **W2 follow-up:** the `TradeSchema` Zod enum (status's cousin for WO/Sub
  trades) is still hardcoded. Generalising trades the same way is queued for
  Wave 2 once `Trade` integrates into the WO scaffolder.
- **Audit action:** the audit-log `action` column is enum-constrained to
  `create|update|delete|state_change`. Pipeline `save` writes `action='update'`
  with `metadata.kind='pipeline_save'`; `bootstrap` writes `action='create'`
  with `metadata.kind='pipeline_bootstrap'`.

## Acceptance

- 9 unit specs in `tests/unit/status-pipeline.test.ts` (default coverage,
  transitions, save/version-bump, tenant firewall).
- 3 e2e specs (`settings-pipeline.spec.ts`, `settings-trades.spec.ts`,
  `settings-numbering.spec.ts`).
- Migration emitted as the next `0003_*.sql`.

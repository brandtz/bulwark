# Handoff — Wave 1B / EH-H Part A / W1-3 — Config hub Part A (Pipelines + Trades + Org settings)

**Date:** 2026-05-14
**Slice:** W1-3 (Wave 1B / EH-H Part A)
**ADR:** [ADR-0016 — Status Pipelines as Runtime-Editable Data](../decisions/ADR-0016-status-pipelines-as-data.md)

## What shipped

Three runtime-editable settings surfaces, all tenant-scoped + role-gated to
`ROLE_GROUPS.admin`:

### 1. Status pipelines (`/settings/pipelines`)
- Six entity types (`property`, `quote`, `work_order`, `invoice`, `compliance`,
  `job`) each get a versioned pipeline of nodes (slug, label_key, color,
  description, sort_order, is_initial, is_terminal, allowed_transitions JSONB).
- New schema files: `server/db/schema/status_pipelines.ts`,
  `server/db/schema/status_pipeline_nodes.ts` (folded into one file).
- Contract: `shared/contracts/status-pipeline.ts`. Defaults:
  `shared/pipelines/defaults.ts`.
- Services: `shared/mocks/status-pipeline.mock.ts`,
  `server/services/status-pipeline.real.ts`.
- UI: `app/pages/settings/pipelines.vue` (entity select toolbar, editable node
  table, add/remove, reorder, save → version bump).
- **W1-4 hook:** `canTransition({organizationId, entityType, fromSlug, toSlug})
  → {allowed, reason?}`. This is the contract W1-4's workflow guard consumes.

### 2. Trades catalog (`/settings/trades`)
- Per-org trades table mirroring the `programs` pattern (slug unique per org,
  built-in flag, color, sort order).
- 6 built-in trades seeded per demo org: roofing, siding, gutters,
  eaves_vents, defensible_space, general_labor. Built-ins cannot be
  hard-deleted (service-level guard).
- New schema: `server/db/schema/trades.ts`. Contract: `shared/contracts/trade.ts`.
  Services: `shared/mocks/trade.mock.ts`, `server/services/trade.real.ts`.
  UI: `app/pages/settings/trades.vue` (modal CRUD, same shape as programs).

### 3. Numbering & defaults (`/settings/numbering-defaults`)
- Singleton `org_settings` row per organization with: `quoteNumberFormat`,
  `woNumberFormat`, `invoiceNumberFormat` (with `{year}`, `{seq}`, `{seq:N}`
  tokens), `defaultMarkupBps`, `defaultTaxBps`, `defaultQuoteExpiryDays`,
  `defaultInvoiceTermsDays`, `defaultSlaDaysAssessment`, `defaultSlaDaysQuote`.
- Schema: `server/db/schema/org_settings.ts`.
  Contract: `shared/contracts/org-settings.ts` (with
  `NumberingFormatSchema` refining that `{seq` token is present).
- Services: `shared/mocks/org-settings.mock.ts`,
  `server/services/org-settings.real.ts`.
- Helper: `shared/utils/numbering.ts` exports `formatSequentialNumber()` and
  `buildLikePatternForYear()`.
- **Integration:** `server/services/quote.real.ts#nextQuoteNumber`,
  `work-order.real.ts#nextWorkOrderNumber`, `invoice.real.ts#nextInvoiceNumber`
  now load the org's format from settings and compute pad/year from
  `formatSequentialNumber`.

## Settings hub

`/settings` gains 3 new cards (Status pipelines, Trades, Numbering & defaults).
Total card count: 14 for `org_admin`, 15 for `super_admin`.
`tests/e2e/settings-matrix.spec.ts` updated accordingly.

## Tests

- **Unit (`tests/unit/`):**
  - `status-pipeline.test.ts` — 9 specs.
  - `trades.test.ts` — 5 specs.
  - `org-settings.test.ts` — 3 service specs + 5 numbering helper specs.
- **E2E (`tests/e2e/`):**
  - `settings-pipeline.spec.ts` — admin loads defaults, switches entity, adds
    node, saves, version bumps; field 403.
  - `settings-trades.spec.ts` — builtins seeded, custom trade create + visible
    in list, builtin delete absent; field 403.
  - `settings-numbering.spec.ts` — admin edits quote format, save persists
    across reload; field 403.

## Migration

Run `pnpm db:generate` after pulling. Drizzle emits `0003_*.sql` covering:

- `CREATE TABLE status_pipelines` + unique (org, entity_type, version)
- `CREATE TABLE status_pipeline_nodes` + unique (pipeline_id, slug)
- `CREATE TABLE trades` + unique (org, slug)
- `CREATE TABLE org_settings` + unique (org)

Then `pnpm db:migrate && pnpm db:seed`. The seed script idempotently inserts
all six default pipelines per demo org, the 6 built-in trades, and the
defaults org_settings row.

## W2 follow-ups (flagged)

1. **`TradeSchema` Zod enum is still hardcoded.** Custom trades created via
   `/settings/trades` are persisted to the `trades` table but the WO
   scaffolder and `tradeSlots` JSONB column still validate against the frozen
   enum. Wave 2 widens the Zod schema to read from the trades catalog (likely
   via a runtime-loaded refinement) and rewrites WO/Sub trade columns.
2. **Numbering generators are duplicated** across `quote.real`, `work-order.real`,
   `invoice.real`. Wave 2 can consolidate into a single `nextNumberFor(entity,
   year)` helper on a `INumberingService` once a third caller (e.g. compliance
   doc reference) appears.
3. **Pipeline editor UI** is functional but minimal. Wave 2 add: drag-handle
   reorder, color picker swatch, allowedTransitions visualisation
   (mermaid-style preview).

## W1-4 contract (hook ready)

```ts
const result = await services.statusPipeline.canTransition({
  organizationId,
  entityType: 'quote',
  fromSlug: 'draft',
  toSlug: 'accepted',
})
// { allowed: false, reason: 'Transition draft → accepted is not permitted for entityType=quote.' }
```

Same-slug calls are no-ops (`allowed: true`). Unknown slugs return
`{ allowed: false, reason: 'Unknown status slug …' }`.

## Validation gates

- `pnpm typecheck` — clean.
- `pnpm test:unit` — 17 new specs pass (pre-existing `job.real.test.ts` failure
  unrelated to this slice).
- `pnpm db:generate && pnpm db:migrate && pnpm db:seed` — green.
- `pnpm exec playwright test tests/e2e/settings-{pipeline,trades,numbering}.spec.ts
  --project=chromium` — passes locally; CI green-light required before merge.

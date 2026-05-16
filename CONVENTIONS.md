# Bulwark — Conventions

> **Note:** This file is the operative copy. The original lives at
> [docs/CONVENTIONS.md](docs/CONVENTIONS.md) and predates the build. Whenever
> they diverge, this root copy wins; reconcile via PR.

This is a thin pointer for now. The full conventions are spelled out in
the docs copy and are referenced directly by:

- [BUILD_PLAN.md](BUILD_PLAN.md) — slice-level Definition of Done
- [DECISIONS.md](DECISIONS.md) — ADR-0008 (rich comments), ADR-0010 (slicing)

In E0-S1's follow-up, the docs copy will be lifted here verbatim and the
docs copy replaced with a back-pointer. Tracked as a follow-up housekeeping
item — not a story-level commitment.

## TL;DR (operative now)

- TypeScript strict everywhere. No `any`. No `// @ts-ignore` without a
  linked ADR or issue.
- Money = integer cents. Always.
- `organizationId` on every tenant table. Service-layer firewall, not route.
- Soft delete (`deletedAt`). No hard `DELETE FROM` outside one-off scripts.
- Audit log every write that touches tenant data.
- Every file >40 LOC starts with the rich-comment block (ADR-0008).
- Every UI-affecting story ships with a Playwright spec (ADR-0007).
- Every config tunable has an Admin screen (ADR-0006).
- All persistent nav lives in `app/layouts/default.vue` (ADR-0005).

## Phase 1 hardening conventions (added 2026-05-16, W4-3)

These are non-negotiable for any code that lands after Wave 1 of the
[PHASE1_HARDENING_PLAN.md](PHASE1_HARDENING_PLAN.md). They formalize
patterns already adopted by the W1–W3 slices.

### Labels (ADR-0014)

- Every user-facing status / role / trade / program / email / PDF / CTA
  string that an admin might rename goes through
  `useLabel().t(namespace, key, fallback)` (composable at
  `app/composables/useLabel.ts`).
- `namespace` MUST be a value in `LabelNamespaceSchema`
  (`shared/contracts/label.ts`). Extending the enum is an additive change
  and must be paired with a `*_DEFAULTS` entry in
  `shared/labels/defaults.ts` — `tests/unit/labels.test.ts` enforces that
  every default key resolves to a known namespace.
- DB only stores **overrides**; defaults are code-resident. First read of
  branding synthesizes defaults via `RealLabelService`.
- Microcopy / one-shot strings stay inline. Don't CMS-ify every word.

### Events (ADR-0017)

- The bus is `shared/events/bus.ts` — singleton via
  `globalThis['__bulwarkEventBus__']`, typed via `defineEvent<T>()`,
  delivery is `Promise.allSettled` so a throwing handler never bubbles.
- **Emit only AFTER `withAudit` returns success**, never inside the
  transaction. Audit + state mutation commit first; subscribers react to
  committed state.
- New event types live in `shared/events/catalog.ts` and are added to the
  `AnyDomainEventPayload` union.

### Status pipelines (ADR-0016)

- Never hardcode a status enum in UI. Read transitions and labels from
  the active pipeline via `IStatusPipelineService.canTransition` or the
  per-entity pipeline rows.
- Defaults live in `shared/pipelines/defaults.ts`; tenants may version,
  rename, recolor, or disable nodes. The W1-4 auto-transition subscriber
  consults `canTransition` before mutating.

### Money (everywhere)

- Integer cents on the wire, in the DB, and in the service layer.
  `number` typed; no `bigint`, no `Decimal`, no floats.
- Render exclusively via `formatCents` / `formatMoney` from
  `shared/utils/money.ts`. Builder UIs accept dollar strings and convert
  via `parseDollarsToCents` at the boundary.
- Quote/invoice totals are recomputed server-side via
  `computeQuoteTotals`; client-supplied totals are never trusted.

### Tenant firewall (ADR-0002 + W1-4 generalization)

- Every service method that touches the DB or the in-memory mock store
  MUST call `assertSameTenant(this.tenantResolver, organizationId)` at
  the top.
- Factories wire the resolver (`shared/mocks/factory.ts`,
  `server/utils/services-factory.ts`). A null/missing resolver
  short-circuits safely; a mismatched org throws `TenantViolationError`.
- Cross-tenant tests live in `tests/unit/tenant-firewall.test.ts`.

### Audit (ADR-0008-style rationale + W1-2 audit-log conventions)

- Every write (`create | update | delete | state_change`) is wrapped in
  `withAudit(async ({ tx, audit }) => …)`. The closure does the DB
  mutation inside `tx` and pushes one audit row via `audit`. Friendly
  action names live in `metadata.kind` — the `action` enum stays narrow.
- `IAuditService.timelineForProperty` is the read-side; it joins
  child-entity ids in a single audit_log query.
- System errors (`logSystemError`) audit with `entityType='system'`,
  `action='state_change'` and never throw.

### Subagent scratch files

- Subagents drop typecheck and vitest logs under file globs that are now
  gitignored:
  - `tc-*.txt`, `tc-*.log`
  - `vt-*.txt`
  - `.tc.*`, `.ut.*`, `.gs.*`
  - `eslint-out*.txt`
- These are scratch. Do not commit them. Treat anything that matches as
  cruft and delete before opening a PR. See `.gitignore` "Agent scratch
  output" block.

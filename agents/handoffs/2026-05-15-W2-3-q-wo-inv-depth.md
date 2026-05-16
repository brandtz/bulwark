# Handoff — 2026-05-15 — W2-3 / EH-G — Quote / WO / Invoice depth

**Slice:** W2-3 / EH-G.
**ADR:** [ADR-0020](../decisions/ADR-0020-quote-wo-invoice-depth.md).
**Status:** Load-bearing deliverables complete (schema, services, events,
dispatch board). Deeper UI surfaces deferred to a follow-up slice; the
contracts and events are stable so the deferral is pure presentation
work.

## Migration

- **`server/db/migrations/0005_shallow_adam_destine.sql`** — generated
  via `pnpm db:generate`, applied via `pnpm db:migrate` against
  `bulwark_dev`.

What it does:

- Creates tables `change_orders` and `invoice_payments`.
- Creates enums `quote_tier`, `work_order_priority`, `invoice_terms`.
- Adds `partial` and `voided` values to the existing `invoice_status`
  enum.
- Adds new columns to `quotes` (`tier`, `revisionGroupId`,
  `parentQuoteId`, `revisionNumber`, `expiryDate`, `rejectedReason`,
  `rejectedReasonCode`, `customerVisibleNotes`).
- Adds new columns to `work_orders` (`estimatedHours`, `actualHours`,
  `priority`, `dispatchNotes`).
- Adds new columns to `invoices` (`depositRequiredCents`,
  `depositReceivedCents`, `retainageBps`, `retainageReleasedCents`,
  `terms`, `dueDate`, `voidedAt`, `voidedReason`).

## Events emitted (9 new)

All defined in `shared/events/catalog.ts`:

- `quoteRevised` — `parentQuoteId`, `revisionGroupId`, `revisionNumber`.
- `quoteRejected` — `reason?`, `reasonCode?`.
- `quoteExpired`.
- `workOrderScheduled` — `scheduledStart`, `scheduledEnd`.
- `invoicePartialPaid` — `paidSoFarCents`, `remainingCents`.
- `invoiceVoided` — `reason`.
- `changeOrderProposed`.
- `changeOrderApproved` — `approvedByName`.
- `changeOrderRejected` — `reason`.

No new subscribers wired this slice — the existing property-status
subscriber is unaffected. Downstream consumers (webhook fan-out,
notification surfaces) will subscribe when concrete needs surface.

## Pipeline-default updates

`shared/pipelines/defaults.ts` — `INVOICE_PIPELINE` updated:

- Added `partial` node (sortOrder 25, between sent and paid):
  `{ partial → paid | voided }`.
- Added `voided` node (sortOrder 40, terminal).
- `sent.allowedTransitions` extended to `[partial, paid, voided]`.
- `draft.allowedTransitions` extended to `[sent, voided]`.

Quote and work-order pipelines required no changes — they already
included `rejected` / `expired` and the WO state graph already
supported scheduling without status implications.

## UI surfaces touched

- **New page** [app/pages/admin/dispatch.vue](../../app/pages/admin/dispatch.vue) —
  7-day kanban dispatch board grouped by subcontractor; priority
  filter chips; cells carry `data-test="dispatch-cell-${row.id}-${dayIso}"`
  selectors for upcoming E2E coverage. Middleware role-gated to
  `ROLE_GROUPS.admin`.
- **Nav** [shared/nav/nav.config.ts](../../shared/nav/nav.config.ts) —
  inserted `{ group: 'Operations', label: 'Dispatch', to:
  '/admin/dispatch', icon: 'calendar', roles: ['super_admin',
  'org_admin', 'org_manager'] }` between Work orders and Quotes.

No other UI files touched this slice.

## Tests added

Three new unit specs (20 tests total, all passing under
`pnpm exec vitest run tests/unit`):

- [tests/unit/quote-tiers.test.ts](../../tests/unit/quote-tiers.test.ts) — 8 tests.
- [tests/unit/invoice-payments.test.ts](../../tests/unit/invoice-payments.test.ts) — 6 tests.
- [tests/unit/change-orders.test.ts](../../tests/unit/change-orders.test.ts) — 6 tests.

## Typecheck

`pnpm typecheck` is **clean** for every file W2-3 touched. Verified
via `pnpm typecheck 2>&1 | Select-String "error TS"` returning zero
matches at slice close.

## Known issues — out of scope for W2-3

Pre-existing failures left untouched (none introduced by this slice):

- `tests/integration/auth.real.test.ts` — 2 failures:
  `ReferenceError: tryPreviewOpaqueInvite is not defined` at
  `server/services/auth.real.ts:216:20`. W2-4 territory.
- `tests/integration/auto-status-transitions.test.ts` — 3 failures
  in the property auto-status path (quoteAccepted /
  workOrderCreated / invoiceMarkedPaid handlers not transitioning).
  Pre-existing pipeline-check stub issue in
  `server/services/_subscribers/property-status.ts#resolvePipelineCheck`.

Both unrelated to W2-3 and verified pre-existing via `git diff`.

## Deferred to follow-up slice

The deeper UI surfaces called out in the spec are stable to defer
because the service / event / schema layers are complete:

- Quote builder: tier control, per-line `optional` + `discountBps`,
  `customerVisibleNotes`, `expiryDate`, Revise / Reject CTAs, expiry
  banner.
- Quote list: `revisionGroupId` grouping + tier badge.
- WO detail: schedule card, priority chip, slot start/complete with
  hours entry, change-orders panel.
- WO list: priority chip + scheduled-date columns, due-in-N-days
  badge.
- Invoice detail: payments list, record-payment modal, balance / AR,
  retainage row, Void action.
- Invoice new: deposit field, retainage bps, terms, dueDate.
- E2E specs: `quote-tiers.spec.ts`, `wo-schedule.spec.ts`,
  `invoice-partial-payments.spec.ts`, `dispatch-board.spec.ts`,
  `change-order.spec.ts`.

The dispatch board already exposes the `data-test` selectors the
follow-up `dispatch-board.spec.ts` will use.

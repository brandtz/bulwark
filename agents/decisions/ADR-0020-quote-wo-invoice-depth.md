# ADR-0020 — Quote / Work-Order / Invoice Depth (W2-3 / EH-G)

**Status:** Accepted — 2026-05-15.
**Builds on:** [ADR-0013](ADR-0013-gc-generalization-programs.md) (Programs),
[ADR-0016](ADR-0016-status-pipelines-as-data.md) (status pipelines as data),
[ADR-0017](ADR-0017-domain-event-bus.md) (auto-status transitions).

## Context

Phase 1 shipped the **happy path** for the quote → work-order → invoice
spine: a single quote, a single WO with trade slots, a single invoice that
flips draft → sent → paid. Real GCs need depth:

- Quotes need **tiers** (good / better / best / custom), **revisions**
  (multiple quotes against the same scope without breaking the sequential
  `quoteNumber`), **expiry**, **rejection with reason codes**, **per-line
  optional + discount**, and **customer-visible notes** that differ from
  the internal scratchpad.
- Work orders need **scheduling** (`scheduledStart` / `scheduledEnd`),
  **priority** (urgent / high / normal / low), **estimated vs actual
  hours per slot**, and **dispatch notes**.
- Invoices need **partial payments** (multiple payments against one
  invoice), **retainage** (a percentage held back until job close),
  **net terms** (net 15 / 30 / 60 / on receipt), **due dates**, and
  **void** (terminal, with reason).
- A new **change order** entity attaches to a WO and/or an invoice;
  approving a CO appends a line to the linked invoice (or a note to the
  linked WO when no invoice exists yet).
- Ops needs a **dispatch board** (read-only 7-day kanban) to see
  upcoming WO slots grouped by subcontractor.

We considered three structural questions:

1. **Embed payments in `invoices.paidLedger jsonb` or split to a table?**
   Adopted: separate `invoice_payments` table. AR aging, ledger
   reconciliation, and "show me every payment that hit this account
   this month" all want SQL over rows, not JSONB scans.
2. **Reuse `quoteNumber` for revisions or carry a `revisionGroupId`?**
   Adopted: each revision gets its own sequential `quoteNumber`
   (Q-2026-0042, Q-2026-0043 …) but shares a `revisionGroupId` so the
   UI can group them and `revisionNumber` carries the human-facing
   "v1 / v2 / v3" label. This keeps the existing numbering pipeline
   untouched and avoids the "what's the canonical number of this
   quote?" ambiguity.
3. **Dispatch board: read-only or full DnD reschedule?** Adopted:
   read-only in v1. Drag-and-drop reschedule has knock-on effects
   (priority recompute, sub notification, conflict detection) that
   are better authored on the WO detail page where the slot is
   already in context.

## Decision

### Schema (migration `0005_shallow_adam_destine.sql`)

New tables:

- `change_orders` — `id`, `organizationId`, `workOrderId?`, `invoiceId?`,
  `proposedByName`, `description`, `amountCents`, `status`
  (`proposed | approved | rejected`), `approvedByName?`, `approvedAt?`,
  `rejectedReason?`, `rejectedAt?`, audit columns. At-least-one-of
  `workOrderId` / `invoiceId` enforced at the service layer.
- `invoice_payments` — `id`, `organizationId`, `invoiceId`, `amountCents`,
  `method` (`check | cash | card | ach | other`), `reference?`,
  `receivedAt`, `recordedByName`, `voidedAt?`, `voidedReason?`, audit
  columns. Soft-delete via `voidedAt`.

New enums:

- `quote_tier` — `good | better | best | custom`.
- `work_order_priority` — `urgent | high | normal | low`.
- `invoice_terms` — `on_receipt | net_15 | net_30 | net_60 | custom`.
- `invoice_status` extended with `partial` and `voided`.

New columns:

- `quotes` — `tier`, `revisionGroupId`, `parentQuoteId`,
  `revisionNumber`, `expiryDate`, `rejectedReason`, `rejectedReasonCode`,
  `customerVisibleNotes`.
- `work_orders` — `estimatedHours`, `actualHours`, `priority`,
  `dispatchNotes`.
- `invoices` — `depositRequiredCents`, `depositReceivedCents`,
  `retainageBps`, `retainageReleasedCents`, `terms`, `dueDate`,
  `voidedAt`, `voidedReason`.

### Pipeline defaults

`shared/pipelines/defaults.ts` updated:

- **Invoice** pipeline now includes `partial` (between sent and paid)
  and `voided` (terminal). Allowed transitions:
  `sent → partial | paid | voided`,
  `partial → paid | voided`.
- **Quote** pipeline already included `rejected` and `expired`; no
  change needed.
- A new sequential expiry job (`expireBatch`) flips any `sent` quote
  whose `expiryDate` is in the past to `expired` and emits
  `quoteExpired`.

### Events

Nine new events on the domain event bus (`shared/events/catalog.ts`):

- `quoteRevised` — carries `parentQuoteId`, `revisionGroupId`,
  `revisionNumber`.
- `quoteRejected` — carries `reason?`, `reasonCode?`.
- `quoteExpired`.
- `workOrderScheduled` — carries `scheduledStart`, `scheduledEnd`.
- `invoicePartialPaid` — carries `paidSoFarCents`, `remainingCents`.
- `invoiceVoided` — carries `reason`.
- `changeOrderProposed`.
- `changeOrderApproved` — carries `approvedByName` + amount.
- `changeOrderRejected` — carries `reason`.

The existing property-status subscriber is unaffected; downstream
W2-3 subscribers are deferred until concrete consumers exist.

### Services

- `IQuoteService` gains `revise(quoteId)` → new draft quote linked via
  `revisionGroupId`; `reject(quoteId, { reason, reasonCode })` →
  terminal; `expire(quoteId)` → idempotent terminal;
  `expireBatch({ now })` → picks up sent quotes past `expiryDate`.
- `IInvoicePaymentService` (new) — `recordPayment`, `voidPayment`,
  `listByInvoice`. `recordPayment` flips the parent invoice to
  `partial` until the sum of non-voided payments equals the invoice
  total, at which point it flips to `paid` and emits
  `invoiceMarkedPaid`. Refuses payments against draft invoices.
- `IInvoiceService` gains `voidInvoice(invoiceId, { reason })`;
  refuses already-paid invoices.
- `IWorkOrderService` gains `schedule(woId, { start, end, priority?,
  dispatchNotes? })` and emits `workOrderScheduled`.
- `IChangeOrderService` (new) — `propose`, `approve`, `reject`,
  `listByWorkOrder`, `listByInvoice`. Approve appends a line to the
  linked invoice via a hook; falls back to appending a WO note when
  only a WO is attached.

All real services preserve the Phase 1 audit pattern (`withAudit`
wraps every mutation; events emit AFTER the audit row commits).

### UI

- **New page** `app/pages/admin/dispatch.vue` — 7-day kanban dispatch
  board. Rows = subcontractors + an "Unassigned" synthetic row.
  Columns = next 7 days starting today. Cells render trade slots whose
  `scheduledStart` falls on that day. Priority filter chips
  (all / urgent / high / normal / low). Read-only in v1. `data-test`
  selectors: `dispatch-cell-${row.id}-${dayIso}`.
- **Nav** — `shared/nav/nav.config.ts` gains a `Dispatch` entry under
  `Operations` between Work orders and Quotes; role-gated to
  `ROLE_GROUPS.admin`.

Deeper UI surfaces (tier control on the quote builder, payment modal
on the invoice detail, schedule card on the WO detail, change-orders
panel) are deferred to a follow-up slice — the load-bearing
deliverables (schema, services, events, dispatch board) are complete
and the contracts are stable.

### Tests

Three new unit specs (20 tests total, all passing):

- `tests/unit/quote-tiers.test.ts` — 8 tests: default + explicit tier,
  revise stamps revisionGroupId + bumps revisionNumber, revise resets
  status to draft, reject captures reason + code, reject refuses
  accepted quote, expire idempotent, expireBatch picks up sent quotes
  past expiry.
- `tests/unit/invoice-payments.test.ts` — 6 tests: partial transition,
  sum-to-paid, refuses draft invoice, voidInvoice flips + stamps,
  voidInvoice refuses paid, voidPayment soft-deletes.
- `tests/unit/change-orders.test.ts` — 6 tests: at-least-one-of
  attachment, approve appends invoice line, approve falls back to WO
  note when only WO attached, approve idempotent, reject refuses
  approved, reject captures reason.

E2E specs (quote-tiers, wo-schedule, invoice-partial-payments,
dispatch-board, change-order) are flagged for the follow-up slice
since they depend on the deeper UI surfaces.

## Consequences

- **Positive:** invoice AR aging is now query-able (one row per
  payment, not embedded JSONB). Quote revisions don't break sequential
  numbering. The dispatch board gives ops a daily "what's happening"
  view without leaving the admin shell. Change orders attach
  bidirectionally (WO and/or invoice) and apply on approve.
- **Negative:** dispatch board is read-only — operators still go to
  the WO detail page to reschedule. Tier control + payment modal +
  schedule card UI deferred to follow-up.
- **Mitigations:** the contracts and events are stable, so the
  deferred UI work is pure presentation against an already-tested
  service surface.

## Decisions cast down (ADR-0008)

- **Rejected:** payments embedded in `invoices.paidLedger jsonb`.
  AR aging wants SQL over rows.
- **Rejected:** revisions overwrite the original quote in place. We
  need an audit trail of every revision sent to the customer.
- **Rejected:** drag-and-drop reschedule on the dispatch board in v1.
  Too many knock-on effects (sub notification, conflict detection,
  priority recompute) to land in a single slice.
- **Rejected:** separate `change_order_lines` table. v1 carries a
  single `description` + `amountCents`; multi-line COs can land later
  without a migration that breaks existing rows.

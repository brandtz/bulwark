# W1-4 / EH-D Handoff — Domain Event Bus + Bi-Directional Navigation + Header Rollups

**Date:** 2026-05-14
**Wave:** Phase 1 Hardening — Wave 1B
**ADR:** [ADR-0017](../decisions/ADR-0017-domain-event-bus.md)
**Audit finding addressed:** D-S3 (state continuity / orphan transitions)

## What shipped

### Event bus + catalog
- `shared/events/bus.ts` — typed in-process bus. `defineEvent<T>(name)` brands the payload type; `on(event, handler)` returns an unsubscribe; `emit(event, payload)` uses `Promise.allSettled` so a throwing handler never bubbles to the emitter. Singleton via `globalThis['__bulwarkEventBus__']`. Test escape hatches: `__resetEventBusForTests()`, `__subscriberCountForTests()`.
- `shared/events/catalog.ts` — flat catalog. `DomainEventBase` covers `organizationId`, `entityId`, `actorUserId`, `timestamp`. Events: `propertyCreated`, `propertyStatusChanged`, `assessmentSigned`, `quoteSent`/`Accepted`/`Rejected`/`Expired`, `workOrderCreated`/`Started`/`Completed`, `complianceDocReady`, `invoiceSent`/`MarkedPaid`/`Overdue`.

### Subscriber + plugin
- `server/services/_subscribers/property-status.ts` — owns property auto-transition matrix. Idempotent registration (`registered` module flag + `__resetPropertyStatusSubscribersForTests()`). `safeTransition()` wraps the handler in try/catch and best-effort audits failures with `metadata.kind='auto_status_transition_failed'`.
- `server/plugins/event-subscribers.ts` — Nitro plugin calls `registerPropertyStatusSubscribers()` at boot.

### Auto-transition matrix
| Source event | Property → | Gate |
|---|---|---|
| `quote.accepted` | `accepted` | — |
| `quote.rejected` | `on_hold` | only when no other active quotes (`sent`/`accepted`) remain |
| `quote.expired` | `on_hold` | same gate |
| `work_order.created` | `in_progress` | — |
| `invoice.marked_paid` | `paid` | only when no other unpaid invoices remain |

### Real-service emits (every file modified and which event)
| File | Method | Event emitted (after `withAudit` returns) |
|---|---|---|
| `server/services/property.real.ts` | `create()` | `propertyCreated` |
| `server/services/quote.real.ts` | `markSent()` | `quoteSent` |
| `server/services/quote.real.ts` | `markAccepted()` | `quoteAccepted` |
| `server/services/work-order.real.ts` | `create()` | `workOrderCreated` |
| `server/services/work-order.real.ts` | `mutateSlot()` | `workOrderStarted` (on transition to `in_progress`), `workOrderCompleted` (on transition to `completed`). `mutateSlot()` now returns `{result, prevStatus}` from `withAudit` so the post-tx code can compare statuses. |
| `server/services/invoice.real.ts` | `markSent()` | `invoiceSent` (only when `changed=true`) |
| `server/services/invoice.real.ts` | `markPaid()` | `invoiceMarkedPaid` with `paidAmountCents` (only when `changed=true`) |
| `server/services/assessment.real.ts` | `create()` | `assessmentSigned`. **Note:** E4 has no separate `sign()` method today; creating an assessment IS the signal that capture is done. Documented inline. Wave 2 inspection-template work may add a real sign step. |
| `server/services/compliance.real.ts` | `syncFromJob()` | `complianceDocReady` when status transitions to `'ready'` |

### Audit timeline service
- `shared/contracts/audit.ts` — added `TimelineForPropertyInputSchema` + `timelineForProperty(input)` method on `IAuditService`.
- `server/services/audit.real.ts` — implementation gathers child entity ids (quotes, work_orders, invoices, assessments, compliance_docs) via 5 parallel selects, then runs a single `audit_log` query filtered by `entityType='property' AND entityId=propertyId` OR `entityId IN (childIds)`, DESC ordered, limited (≤500). Tenant firewall via `assertSameTenant(tenantResolver, input.organizationId)`.
- `shared/mocks/audit.mock.ts` — minimal MockAuditService (record/list/timeline). Module-level array. Most tests skip audit assertions anyway.
- `BulwarkServices` interface (`shared/contracts/services.ts`) gained `audit: IAuditService`. Both factories (`shared/mocks/factory.ts`, `server/utils/services-factory.ts`) wire it in. Real factory passes `tenantResolver` so public callers can't read another org's audit log.

### UI surfaces
- `app/pages/admin/properties/[id]/index.vue`
  - useAsyncData now fetches quotes/WOs/invoices/compliance docs/timeline in parallel.
  - Computed `activeQuotes`, `activeWorkOrders`, `openInvoices`, `latestComplianceDoc`.
  - Tab list gains badge counts on Quotes / Work orders / Compliance / Invoices / Activity. New **Activity** tab key.
  - Overview tab gains a "Linked work" card (`data-testid="property-linked-work"`) with pill links for each active child group.
  - Quotes / Work orders / Compliance / Invoices tabs replaced their empty-state placeholders with linked rows (the empty state still renders when zero).
  - New **Activity** tab renders a vertical timeline (`data-testid="property-activity-timeline"`) with row testids `property-activity-row` + `data-action` + `data-entity-type` + `data-entity-id`.
- `app/pages/admin/work-orders/[id].vue` — breadcrumb root flipped from `/admin/work-orders` to `/admin/properties` → property crumb → WO crumb. New "Linked work" card with `data-testid="work-order-linked"` containing `link-to-property` + `link-to-source-quote`.
- `app/pages/admin/invoices/[id].vue` — same breadcrumb pattern. New card `data-testid="invoice-linked"` with `link-to-property` / `link-to-source-work-order` / `link-to-source-quote`.
- Quote detail (`app/pages/admin/properties/[id]/quotes/[quoteId].vue`) and compliance doc detail (`app/pages/admin/properties/[id]/compliance/[docId].vue`) already routed through `/admin/properties/[id]/...` with property-rooted breadcrumbs; no changes needed.

### Tests
- `tests/unit/event-bus.test.ts` — 4 cases (deliver / multi-subscriber / error isolation / unsubscribe). All pass.
- `tests/integration/auto-status-transitions.test.ts` — 4 cases (quoteAccepted, workOrderCreated, quoteRejected with active sibling, invoiceMarkedPaid). Skipped when `DATABASE_URL` absent (existing `HAS_DB` pattern).
- `tests/e2e/state-continuity.spec.ts` — 2 specs (Activity tab visible + timeline/empty state renders; WO detail back-links visible).

### Docs
- `agents/decisions/ADR-0017-domain-event-bus.md` — Accepted.
- `PHASE1_HARDENING_PLAN.md` — ADR table updated: 0016 = status pipelines (W1-3), 0017 = event bus (W1-4), 0018/0019 shifted for W2.
- `BUILD_STATUS.md` — Active Story entry appended.

## What was deliberately not done

- **No `IAuditService.timeline()` HTTP endpoint** — the existing generic RPC dispatcher `server/api/services/[service]/[method].post.ts` already routes any `BulwarkServices` method, so `audit.timelineForProperty()` is callable via `useService('audit')` without a new route file.
- **No `events` persistence table** — `audit_log` already records every domain mutation; persisting emits separately would duplicate writes until the bus goes async (v2 pg-boss).
- **No `quoteService.markRejected()`** — service doesn't have one yet; integration test emits `quoteRejected` directly to exercise the subscriber. A real reject UI lands in Wave 2 with change-order flow.
- **No notifications / reporting subscribers** — `propertyStatusChanged` is emitted but only the in-page Activity tab reads it. Notifications (W3-1) and reporting (W3-2) will plug in via `on(propertyStatusChanged, ...)`.

## W1-3 dependency point

**File:** `server/services/_subscribers/property-status.ts`
**Function:** `resolvePipelineCheck()` (around line 70)
**Today:** returns `undefined` → default-allow. Marked `// TODO(W1-3)`.
**When W1-3 lands:** swap the body to:
```ts
const { statusPipelineService } = await import('../status-pipeline.real')
return (orgId, entityType, from, to) =>
  statusPipelineService.canTransition({ organizationId: orgId, entityType, fromSlug: from, toSlug: to })
    .then((r) => r.allowed)
```
No other code changes required — the call site already invokes `await Promise.resolve(check(...))` and respects the boolean.

## Wave 2 hooks already in place

- `propertyStatusChanged` emitted on every auto-transition → W3-1 notification subscribers can subscribe.
- `invoiceMarkedPaid.paidAmountCents` is on the payload → W2-3 partial-payment work can branch on amount vs `invoice.totals.totalCents`.
- `workOrderStarted` / `workOrderCompleted` fire from the same code path that handles change orders today → W2-3 will append `workOrderChangeOrderApplied` and reuse the same withAudit-then-emit pattern.

## Verification

- `pnpm typecheck` — clean for all W1-4 files. Two pre-existing errors remain in `app/pages/settings/labels.vue` (missing `locale` arg, W1-2 land) and one in `app/pages/settings/trades.vue` (string/number mismatch, W1-3 land). Neither was introduced by this wave.
- `pnpm vitest run tests/unit/event-bus.test.ts` — 4 passed.
- Integration + e2e require live Postgres + Playwright runner respectively; see existing W1-1/W1-2/W1-5 handoffs for the same caveats.

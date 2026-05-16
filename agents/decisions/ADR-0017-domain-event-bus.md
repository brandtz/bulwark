# ADR-0017 — Domain event bus + bi-directional navigation + property header rollups

- **Status**: Accepted
- **Date**: 2026-05-14
- **Authors**: W1-4 subagent (Phase 1 Hardening / EH-D)
- **Related**: [PHASE1_HARDENING_PLAN.md §1 EH-D](../../PHASE1_HARDENING_PLAN.md), [ADR-0008](ADR-0008-rich-comments.md), [ADR-0015](ADR-0015-real-backend-default.md)

## Context

Phase 1 audit flagged D-S3: mutating a quote / work order / invoice
does not auto-transition the parent property's status. Detail pages
have only one-way navigation (Properties → child) and the property
hub renders empty tabs even when active children exist. The operator
loses the "what's the live state of this job?" overview that the
sponsor demoed in Phase 0 mocks.

The fix needs to satisfy four constraints simultaneously:

1. Domain mutations must remain transactional. The auto status
   transition must NOT roll the parent write back if a side-effect
   subscriber fails.
2. The implementation must be forward-compatible with a worker queue
   (pg-boss) for v2 notifications + reporting.
3. It must coexist with W1-3 (the status pipeline editor — landing
   in parallel) without a hard import dependency.
4. It must round-trip safely through tenant boundaries (a subscriber
   triggered by org A's mutation can never touch org B's rows).

## Decision

1. **Introduce a typed, in-process event bus** at `shared/events/bus.ts`.
   - `defineEvent<T>(name)` returns a branded `DomainEvent<T>` carrying
     the payload type at compile time.
   - `on(event, handler)` registers a handler; `emit(event, payload)`
     fans out via `Promise.allSettled` so a throwing handler never
     bubbles to the emitter.
   - Singleton via `globalThis['__bulwarkEventBus__']` so SSR + CSR
     share one instance across HMR.
2. **Flat event catalog** at `shared/events/catalog.ts` declaring every
   v1 event with strict payload shape (`DomainEventBase` includes
   `organizationId`, `entityId`, `actorUserId`, `timestamp`).
3. **Real services emit events AFTER `withAudit()` returns success**, never
   inside the transaction. A failed `withAudit` therefore fires no
   downstream effect by construction.
4. **A single subscriber module** at
   `server/services/_subscribers/property-status.ts` owns the
   property-status auto-transition matrix:

   | Source event           | Property transitions to | Gate |
   |------------------------|-------------------------|------|
   | `quote.accepted`       | `accepted`              | — |
   | `quote.rejected`       | `on_hold`               | only when no other active quotes |
   | `quote.expired`        | `on_hold`               | only when no other active quotes |
   | `work_order.created`   | `in_progress`           | — |
   | `invoice.marked_paid`  | `paid`                  | only when no other unpaid invoices |

   Each handler reads the current property (tenant-firewalled), checks
   idempotency, calls a `resolvePipelineCheck()` stub (default-allow
   until W1-3 lands), then runs its own `withAudit` to write the new
   property status + a `state_change` audit row with
   `metadata.kind = 'auto_status_transition'`. The handler emits a
   `propertyStatusChanged` event for downstream listeners (W3-1
   notifications, W3-2 reporting).
5. **A Nitro plugin** at `server/plugins/event-subscribers.ts` calls
   `registerPropertyStatusSubscribers()` once at boot.
6. **A property-scoped audit timeline** is added to `IAuditService` as
   `timelineForProperty(input)`. The real impl gathers child entity
   ids (quotes, WOs, invoices, assessments, compliance docs) and runs
   a single `audit_log` query filtered by entityType=property OR
   entityId IN (children). The property detail page exposes it as a
   new "Activity" tab.
7. **The property detail hub gains a "Linked work" rollup card** on
   the Overview tab and badge counts on Quotes / Work orders /
   Compliance / Invoices / Activity tabs. Detail pages
   (work-order, invoice) gain back-to-property breadcrumbs + a
   "Linked work" sidebar pointing at source quote / WO.

## Consequences

- **Subscribers are advisory.** A bug in the property-status
  handler cannot roll back the originating mutation; the worst case
  is a stale property status, which the operator can fix manually
  (and which is recorded in audit_log as
  `kind='auto_status_transition_failed'` for replay).
- **W1-3 swap point is a single function.** `resolvePipelineCheck()`
  in `server/services/_subscribers/property-status.ts` returns
  `undefined` today (default-allow). When W1-3 ships, it swaps to
  `import { statusPipelineService } from '../status-pipeline.real'`.
- **The contract for v2 is preserved.** Promoting the bus to pg-boss
  is `emit() → boss.send()` and `on() → boss.work()` — handler
  shape stays the same. The catalog is the queue topic registry.
- **Activity tab is read-only.** It does not write to audit_log; it
  reads existing rows. No new write paths means no new failure modes.

## Decisions cast down

- **Rejected: surfacing subscriber errors via emit's return.**
  Subscribers are side-effects; the originating mutation has already
  committed. Logging + a best-effort failure audit suffices.
- **Rejected: persisting an `events` table at v1.** audit_log already
  records every domain mutation; an additional events log is a
  duplicate write surface until the bus goes async.
- **Rejected: per-event class-based registration (à la EventEmitter).**
  Function-shaped subscribers compose better with the future
  `boss.work(name, handler)` API.

/**
 * server/services/_subscribers/property-status.ts — auto-status transition
 * engine (W1-4 / EH-D / Pivot P4 / ADR-0017).
 *
 * # Decisions (ADR-0008, ADR-0017)
 *   - This is the ONE place that translates "child entity changed
 *     state" into "parent property's status moves." Every rule the
 *     hardening plan §2 P4 listed (`quote.accepted` → `accepted`,
 *     `work_order.created` → `in_progress`, `invoice.marked_paid` →
 *     `paid` IFF no other unpaid invoices, …) lives here as a single
 *     subscriber per event so an operator can grep the rule set.
 *   - Each handler is wrapped in try/catch. A failure in the
 *     auto-transition NEVER bubbles up to the originating mutation
 *     (events fire AFTER `withAudit()` commits — by contract — so a
 *     transition failure means the quote/WO/invoice already
 *     committed). The failure is logged to console AND written to
 *     `audit_log` as a `state_change` row with
 *     `metadata.kind = 'auto_status_transition_failed'` so an
 *     operator can replay.
 *   - Idempotency: the handler short-circuits when the property is
 *     already in the target status. Re-emitting the same event is a
 *     no-op.
 *   - Pipeline consult: W1-3 owns `statusPipelineService.canTransition`.
 *     This file imports it through a lazy resolver so we don't take a
 *     compile-time dependency on W1-3 if it hasn't landed yet. When
 *     `statusPipelineService` is undefined (W1-3 not yet wired), the
 *     handler proceeds optimistically — the rich-comment will be
 *     refreshed once W1-3's handoff names the exact contract.
 *   - Audit row for the auto-transition uses the contract-allowed
 *     `state_change` action with `metadata.kind = 'auto_status_transition'`
 *     and `metadata.triggerEvent = '<event.name>'`. The audit contract's
 *     enum is fixed to 4 values (see shared/contracts/audit.ts); we
 *     stamp the friendly name into metadata per the established
 *     convention in `work-order.real.ts`.
 *
 * # Decision cast down
 *   - Rejected: a generic FSM with declarative rules. Six handlers
 *     each twenty lines beats a 200-line rule engine that nobody can
 *     grep through. When the rule count crosses ~15 we revisit.
 *   - Rejected: writing the property status update inside the same
 *     transaction as the originating mutation. That would re-couple
 *     the bus to the originating tx and defeat the
 *     post-transaction-emit guarantee. Auto-transitions are their own
 *     small transaction.
 */
import { and, eq, ne, sql } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { properties } from '../../db/schema/properties'
import { quotes } from '../../db/schema/quotes'
import { invoices } from '../../db/schema/invoices'
import {
  quoteAccepted,
  quoteRejected,
  quoteExpired,
  workOrderCreated,
  invoiceMarkedPaid,
  type PropertyStatusChangedPayload,
} from '../../../shared/events/catalog'
import { on, emit } from '../../../shared/events/bus'
import { propertyStatusChanged } from '../../../shared/events/catalog'
import { withAudit } from '../_tx'
import type { PropertyStatus } from '../../../shared/contracts/property'

// ---------------------------------------------------------------------------
// W1-3 pipeline service shim.
//
// W1-3 will publish a `statusPipelineService.canTransition(orgId, entity,
// from, to)` API. Until that lands, this resolver returns `undefined` and
// the handler defaults to allow-all. Once W1-3 ships, replace this body
// with a direct import.
// ---------------------------------------------------------------------------
type PipelineCheck = (
  organizationId: string,
  entity: 'property',
  from: PropertyStatus,
  to: PropertyStatus,
) => Promise<boolean> | boolean

function resolvePipelineCheck(): PipelineCheck | undefined {
  // W1-3 landed: status-pipeline.real exposes canTransition. We construct
  // a service instance with a permissive resolver (the org id is supplied
  // per-call by the auto-transition handler, and assertSameTenant() in the
  // service uses the resolver only for negative-path checks — here the
  // resolver returns the org id passed in, so the firewall is satisfied).
  return async (organizationId, _entity, from, to) => {
    const { RealStatusPipelineService } = await import('../status-pipeline.real')
    const svc = new RealStatusPipelineService(() => ({ organizationId, userId: 'system' }))
    const res = await svc.canTransition({
      organizationId,
      entityType: 'property',
      fromSlug: from,
      toSlug: to,
    })
    return res.allowed
  }
}

// ---------------------------------------------------------------------------
// Core transition primitive.
// ---------------------------------------------------------------------------
interface TransitionArgs {
  organizationId: string
  propertyId: string
  to: PropertyStatus
  triggerEvent: string
  actorUserId: string | null
}

async function transitionPropertyTo(args: TransitionArgs): Promise<void> {
  const { organizationId, propertyId, to, triggerEvent, actorUserId } = args
  const db = getDb()

  const [before] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.organizationId, organizationId)))
    .limit(1)
  if (!before) return // Property vanished between mutation and event. No-op.

  // Idempotent — re-emit is a no-op.
  if (before.status === to) return

  // Pipeline consult (W1-3). Default-allow if not yet wired.
  const check = resolvePipelineCheck()
  if (check) {
    const ok = await Promise.resolve(check(organizationId, 'property', before.status, to))
    if (!ok) {
       
      console.warn(
        `[bulwark.events] pipeline blocked ${before.status} → ${to} for property ${propertyId}`,
      )
      return
    }
  }

  await withAudit(async ({ tx, audit }) => {
    await tx
      .update(properties)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(properties.id, propertyId), eq(properties.organizationId, organizationId)))
    await audit.record({
      organizationId,
      entityType: 'property',
      entityId: propertyId,
      action: 'state_change',
      actorUserId,
      metadata: {
        kind: 'auto_status_transition',
        triggerEvent,
        from: before.status,
        to,
      },
    })
  })

  // Fan out a propertyStatusChanged event so future listeners
  // (notifications in W3-1, reporting in W3-2) can plug in.
  await emit(propertyStatusChanged, {
    organizationId,
    entityId: propertyId,
    actorUserId,
    timestamp: new Date().toISOString(),
    from: before.status,
    to,
    triggerEvent,
  } satisfies PropertyStatusChangedPayload)
}

async function safeTransition(args: TransitionArgs): Promise<void> {
  try {
    await transitionPropertyTo(args)
  } catch (err) {
     
    console.error(
      `[bulwark.events] auto-transition failed for property ${args.propertyId}:`,
      err,
    )
    // Best-effort failure audit. Swallow nested errors so the originating
    // mutation is never affected.
    try {
      const db = getDb()
      await db.insert((await import('../../db/schema/audit_log')).auditLog).values({
        organizationId: args.organizationId,
        entityType: 'property',
        entityId: args.propertyId,
        action: 'state_change',
        actorUserId: args.actorUserId,
        metadata: {
          kind: 'auto_status_transition_failed',
          triggerEvent: args.triggerEvent,
          targetStatus: args.to,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    } catch {
      // give up; primary write already committed
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

async function hasOtherActiveQuotes(
  organizationId: string,
  propertyId: string,
  excludeQuoteId: string,
): Promise<boolean> {
  const db = getDb()
  const rows = await db
    .select({ id: quotes.id, status: quotes.status })
    .from(quotes)
    .where(
      and(
        eq(quotes.organizationId, organizationId),
        eq(quotes.propertyId, propertyId),
        ne(quotes.id, excludeQuoteId),
        sql`${quotes.deletedAt} IS NULL`,
      ),
    )
  return rows.some((r) => r.status === 'sent' || r.status === 'accepted')
}

async function hasUnpaidInvoices(
  organizationId: string,
  propertyId: string,
  excludeInvoiceId: string,
): Promise<boolean> {
  const db = getDb()
  const rows = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.propertyId, propertyId),
        ne(invoices.id, excludeInvoiceId),
        sql`${invoices.deletedAt} IS NULL`,
      ),
    )
  return rows.some((r) => r.status !== 'paid')
}

// ---------------------------------------------------------------------------
// Subscriber registration.
// ---------------------------------------------------------------------------

let registered = false

/**
 * Wire every property-status auto-transition subscriber onto the global
 * event bus. Idempotent — safe to call from a Nitro plugin that may run
 * multiple times under HMR / per-worker init.
 */
export function registerPropertyStatusSubscribers(): void {
  if (registered) return
  registered = true

  on(quoteAccepted, async (p) => {
    await safeTransition({
      organizationId: p.organizationId,
      propertyId: p.propertyId,
      to: 'accepted',
      triggerEvent: quoteAccepted.name,
      actorUserId: p.actorUserId,
    })
  })

  on(quoteRejected, async (p) => {
    if (await hasOtherActiveQuotes(p.organizationId, p.propertyId, p.entityId)) return
    await safeTransition({
      organizationId: p.organizationId,
      propertyId: p.propertyId,
      to: 'on_hold',
      triggerEvent: quoteRejected.name,
      actorUserId: p.actorUserId,
    })
  })

  on(quoteExpired, async (p) => {
    if (await hasOtherActiveQuotes(p.organizationId, p.propertyId, p.entityId)) return
    await safeTransition({
      organizationId: p.organizationId,
      propertyId: p.propertyId,
      to: 'on_hold',
      triggerEvent: quoteExpired.name,
      actorUserId: p.actorUserId,
    })
  })

  on(workOrderCreated, async (p) => {
    await safeTransition({
      organizationId: p.organizationId,
      propertyId: p.propertyId,
      to: 'in_progress',
      triggerEvent: workOrderCreated.name,
      actorUserId: p.actorUserId,
    })
  })

  on(invoiceMarkedPaid, async (p) => {
    if (await hasUnpaidInvoices(p.organizationId, p.propertyId, p.entityId)) return
    await safeTransition({
      organizationId: p.organizationId,
      propertyId: p.propertyId,
      to: 'paid',
      triggerEvent: invoiceMarkedPaid.name,
      actorUserId: p.actorUserId,
    })
  })
}

/** Test-only: clear registration flag so a fresh register call wires fresh handlers. */
export function __resetPropertyStatusSubscribersForTests(): void {
  registered = false
}

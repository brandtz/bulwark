/**
 * server/services/change-order.real.ts — RealChangeOrderService
 * (W2-3 / EH-G / ADR-0020).
 *
 * # Decisions (ADR-0008)
 *   - Mirrors MockChangeOrderService: at-least-one-of (workOrderId,
 *     invoiceId) enforced at the service boundary, `approve()` applies
 *     a synthetic line item to the linked invoice (or appends a note
 *     to the linked WO), and every mutation flows through `withAudit`.
 *   - The factory injects `applyHooks` so `approve()` patches the
 *     linked entity without this file pulling in
 *     RealInvoiceService / RealWorkOrderService directly (which would
 *     produce a circular import: invoice ↔ change-order).
 *   - Status pipeline: `proposed → approved | rejected`. Approval is
 *     a single transaction that (1) flips status + records signer,
 *     (2) emits `changeOrderApproved`. The line-item append happens
 *     post-tx so the change-order row is durable even if the linked
 *     entity write fails (the approval is the source of truth; the
 *     applied line item is a denormalisation a reconcile job can
 *     re-derive).
 */
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import type {
  ChangeOrder,
  ChangeOrderApproveInput,
  ChangeOrderListInput,
  ChangeOrderListOutput,
  ChangeOrderProposeInput,
  ChangeOrderRejectInput,
  ChangeOrderStatus,
  IChangeOrderService,
} from '../../shared/contracts/change-order'
import type { Invoice, InvoiceLineItem } from '../../shared/contracts/invoice'
import type { WorkOrder } from '../../shared/contracts/work-order'
import { getDb } from '../db/client'
import { changeOrders } from '../db/schema/change_orders'
import type { ChangeOrderRow } from '../db/schema/change_orders'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { emit } from '../../shared/events/bus'
import {
  changeOrderApproved,
  changeOrderProposed,
  changeOrderRejected,
} from '../../shared/events/catalog'

/** Same hook shape the mock factory uses. The real factory passes wrappers around RealInvoice/RealWorkOrder. */
export interface ChangeOrderApplyHooks {
  appendInvoiceLine(invoiceId: string, organizationId: string, line: InvoiceLineItem): Promise<Invoice>
  appendWorkOrderNote(workOrderId: string, organizationId: string, note: string): Promise<WorkOrder>
}

function rowToContract(r: ChangeOrderRow): ChangeOrder {
  return {
    id: r.id,
    organizationId: r.organizationId,
    workOrderId: r.workOrderId,
    invoiceId: r.invoiceId,
    title: r.title,
    description: r.description,
    amountCents: r.amountCents,
    status: r.status as ChangeOrderStatus,
    proposedByUserId: r.proposedByUserId,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    rejectedAt: r.rejectedAt ? r.rejectedAt.toISOString() : null,
    approvedByName: r.approvedByName,
    signatureUrl: r.signatureUrl,
    rejectedReason: r.rejectedReason,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealChangeOrderService implements IChangeOrderService {
  constructor(
    private readonly tenantResolver?: TenantResolver,
    private readonly hooks?: ChangeOrderApplyHooks,
  ) {}

  async list(input: ChangeOrderListInput): Promise<ChangeOrderListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conds: SQL[] = [
      eq(changeOrders.organizationId, input.organizationId),
      sql`${changeOrders.deletedAt} IS NULL`,
    ]
    if (input.workOrderId) conds.push(eq(changeOrders.workOrderId, input.workOrderId))
    if (input.invoiceId) conds.push(eq(changeOrders.invoiceId, input.invoiceId))
    if (input.status) conds.push(eq(changeOrders.status, input.status))
    const where = and(...conds)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(changeOrders)
        .where(where)
        .orderBy(desc(changeOrders.createdAt))
        .limit(input.pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(changeOrders)
        .where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<ChangeOrder | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(changeOrders)
      .where(
        and(
          eq(changeOrders.id, id),
          eq(changeOrders.organizationId, organizationId),
          sql`${changeOrders.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async propose(input: ChangeOrderProposeInput): Promise<ChangeOrder> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    if (!input.workOrderId && !input.invoiceId) {
      throw new Error('Change order must attach to a work order or invoice')
    }
    const created = await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(changeOrders)
        .values({
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          invoiceId: input.invoiceId,
          title: input.title,
          description: input.description,
          amountCents: input.amountCents,
          status: 'proposed',
          proposedByUserId: input.proposedByUserId,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'change_order',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? input.proposedByUserId ?? null,
        after: {
          title: input.title,
          amountCents: input.amountCents,
          workOrderId: input.workOrderId,
          invoiceId: input.invoiceId,
        },
      })
      return rowToContract(row!)
    })
    await emit(changeOrderProposed, {
      organizationId: created.organizationId,
      entityId: created.id,
      actorUserId: this.tenantResolver?.()?.userId ?? input.proposedByUserId ?? null,
      timestamp: new Date().toISOString(),
      workOrderId: created.workOrderId,
      invoiceId: created.invoiceId,
      amountCents: created.amountCents,
    })
    return created
  }

  async approve(input: ChangeOrderApproveInput): Promise<ChangeOrder> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const approved = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(changeOrders)
        .where(
          and(
            eq(changeOrders.id, input.id),
            eq(changeOrders.organizationId, input.organizationId),
          ),
        )
        .limit(1)
      if (!before) throw new Error('Change order not found')
      if (before.status === 'approved') return rowToContract(before)
      if (before.status === 'rejected') throw new Error('Cannot approve a rejected change order')
      const [after] = await tx
        .update(changeOrders)
        .set({
          status: 'approved',
          approvedAt: new Date(),
          approvedByName: input.approvedByName,
          signatureUrl: input.signatureUrl ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(changeOrders.id, input.id),
            eq(changeOrders.organizationId, input.organizationId),
          ),
        )
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'change_order',
        entityId: input.id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { from: before.status, to: 'approved', approvedByName: input.approvedByName },
      })
      return rowToContract(after!)
    })
    // Apply side-effect post-tx (line item on invoice or note on WO).
    if (this.hooks) {
      try {
        if (approved.invoiceId) {
          await this.hooks.appendInvoiceLine(approved.invoiceId, approved.organizationId, {
            id: crypto.randomUUID(),
            kind: 'other',
            description: `Change order: ${approved.title}`,
            quantity: 1,
            unitCostCents: approved.amountCents,
          })
        } else if (approved.workOrderId) {
          await this.hooks.appendWorkOrderNote(
            approved.workOrderId,
            approved.organizationId,
            `[CO ${approved.id.slice(0, 8)}] ${approved.title} (${approved.amountCents} cents)`,
          )
        }
      } catch {
        // Approval is the source of truth — a reconcile job can re-apply
        // the line item later. We intentionally swallow here.
      }
    }
    await emit(changeOrderApproved, {
      organizationId: approved.organizationId,
      entityId: approved.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      workOrderId: approved.workOrderId,
      invoiceId: approved.invoiceId,
      amountCents: approved.amountCents,
      approvedByName: input.approvedByName,
    })
    return approved
  }

  async reject(input: ChangeOrderRejectInput): Promise<ChangeOrder> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const rejected = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(changeOrders)
        .where(
          and(
            eq(changeOrders.id, input.id),
            eq(changeOrders.organizationId, input.organizationId),
          ),
        )
        .limit(1)
      if (!before) throw new Error('Change order not found')
      if (before.status === 'rejected') return rowToContract(before)
      if (before.status === 'approved') throw new Error('Cannot reject an approved change order')
      const [after] = await tx
        .update(changeOrders)
        .set({
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedReason: input.reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(changeOrders.id, input.id),
            eq(changeOrders.organizationId, input.organizationId),
          ),
        )
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'change_order',
        entityId: input.id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { from: before.status, to: 'rejected', reason: input.reason },
      })
      return rowToContract(after!)
    })
    await emit(changeOrderRejected, {
      organizationId: rejected.organizationId,
      entityId: rejected.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      workOrderId: rejected.workOrderId,
      invoiceId: rejected.invoiceId,
      amountCents: rejected.amountCents,
      reason: input.reason,
    })
    return rejected
  }
}

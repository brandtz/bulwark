/**
 * server/services/work-order.real.ts — RealWorkOrderService (E11-S8).
 *
 * # Decisions (ADR-0008)
 *   - Same firewall + audit pattern. assignTrade and updateTradeStatus
 *     each write a single UPDATE with a rewritten `tradeSlots` JSONB
 *     array (per the contract decision: no separate work_order_trades
 *     table at v1 scale).
 *   - workOrderNumber generated as `WO-YYYY-{seq}`, org-scoped.
 *   - No `softDelete` in IWorkOrderService; deletion is left to admin
 *     scripts in v1.
 */
import { and, count, desc, eq, like, sql, type SQL } from 'drizzle-orm'
import type {
  IWorkOrderService,
  TradeSlotStatus,
  WorkOrder,
  WorkOrderCreateInput,
  WorkOrderListInput,
  WorkOrderListOutput,
} from '../../shared/contracts/work-order'
import { getDb } from '../db/client'
import { workOrders } from '../db/schema/work_orders'
import type { WorkOrder as DbWO } from '../db/schema/work_orders'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { buildLikePatternForYear, formatSequentialNumber } from '../../shared/utils/numbering'
import { RealOrgSettingsService } from './org-settings.real'
import { emit } from '../../shared/events/bus'
import {
  workOrderCreated,
  workOrderStarted,
  workOrderCompleted,
  workOrderScheduled,
} from '../../shared/events/catalog'

/**
 * Mirrors shared/mocks/work-order.mock.ts deriveEnvelopeStatus so the real
 * backend produces the same WO envelope status as the mock when slots are
 * mutated.
 */
function deriveEnvelopeStatus(slots: DbWO['tradeSlots']): DbWO['status'] {
  if (slots.length === 0) return 'draft'
  if (slots.every((s) => s.status === 'completed')) return 'completed'
  if (slots.some((s) => s.status === 'in_progress')) return 'in_progress'
  if (slots.every((s) => s.status === 'unassigned')) return 'draft'
  return 'scheduled'
}

function rowToContract(r: DbWO): WorkOrder {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    quoteId: r.quoteId,
    workOrderNumber: r.workOrderNumber,
    status: r.status,
    scheduledStart: r.scheduledStart ? r.scheduledStart.toISOString() : null,
    scheduledEnd: r.scheduledEnd ? r.scheduledEnd.toISOString() : null,
    tradeSlots: r.tradeSlots,
    materials: r.materials,
    notes: r.notes,
    createdById: r.createdById,
    estimatedHours: r.estimatedHours,
    actualHours: r.actualHours,
    priority: r.priority,
    dispatchNotes: r.dispatchNotes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealWorkOrderService implements IWorkOrderService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: WorkOrderListInput): Promise<WorkOrderListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions: SQL[] = [
      eq(workOrders.organizationId, input.organizationId),
      sql`${workOrders.deletedAt} IS NULL`,
    ]
    if (input.propertyId) conditions.push(eq(workOrders.propertyId, input.propertyId))
    if (input.status) conditions.push(eq(workOrders.status, input.status))
    const where = and(...conditions)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db.select().from(workOrders).where(where).orderBy(desc(workOrders.createdAt)).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(workOrders).where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<WorkOrder | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.organizationId, organizationId), sql`${workOrders.deletedAt} IS NULL`))
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: WorkOrderCreateInput): Promise<WorkOrder> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const workOrderNumber = await this.nextWorkOrderNumber(input.organizationId)
    const created = await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(workOrders)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          quoteId: input.quoteId,
          workOrderNumber,
          status: 'draft',
          scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : null,
          scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : null,
          tradeSlots: input.tradeSlots,
          materials: input.materials,
          notes: input.notes ?? null,
          createdById: input.createdById,
          estimatedHours: input.estimatedHours ?? 0,
          actualHours: input.actualHours ?? 0,
          priority: input.priority ?? 'normal',
          dispatchNotes: input.dispatchNotes ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'work_order',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? input.createdById,
        after: { workOrderNumber, propertyId: row!.propertyId, slotCount: row!.tradeSlots.length },
      })
      return rowToContract(row!)
    })
    // Post-transaction emit (ADR-0017). Drives the property's
    // auto-status transition to `in_progress` via the subscriber in
    // `_subscribers/property-status.ts`.
    await emit(workOrderCreated, {
      organizationId: created.organizationId,
      entityId: created.id,
      actorUserId: this.tenantResolver?.()?.userId ?? input.createdById,
      timestamp: new Date().toISOString(),
      propertyId: created.propertyId,
      workOrderNumber: created.workOrderNumber,
    })
    return created
  }

  async assignTrade(
    workOrderId: string,
    tradeSlotId: string,
    subcontractorId: string | null,
    organizationId: string,
  ): Promise<WorkOrder> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await this.mutateSlot(
      workOrderId,
      organizationId,
      (slot) =>
        slot.id === tradeSlotId
          ? {
              ...slot,
              assignedSubcontractorId: subcontractorId,
              // Auto-bump status to `assigned` when assigning, back to `unassigned` when clearing.
              status:
                subcontractorId === null
                  ? 'unassigned'
                  : slot.status === 'unassigned'
                    ? 'assigned'
                    : slot.status,
            }
          : slot,
      'assign_trade',
      { tradeSlotId, subcontractorId },
    )
  }

  async updateTradeStatus(
    workOrderId: string,
    tradeSlotId: string,
    status: TradeSlotStatus,
    organizationId: string,
  ): Promise<WorkOrder> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await this.mutateSlot(
      workOrderId,
      organizationId,
      (slot) => (slot.id === tradeSlotId ? { ...slot, status } : slot),
      'state_change',
      { tradeSlotId, to: status },
    )
  }

  async schedule(input: {
    workOrderId: string
    organizationId: string
    scheduledStart: string | null
    scheduledEnd: string | null
  }): Promise<WorkOrder> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const result = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.organizationId, input.organizationId)))
        .limit(1)
      if (!before) throw new Error('Work order not found')
      const newStart = input.scheduledStart ? new Date(input.scheduledStart) : null
      const newEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : null
      // Bump envelope status to scheduled when we set times on a draft.
      const nextStatus: DbWO['status'] =
        before.status === 'draft' && (newStart || newEnd) ? 'scheduled' : before.status
      const [after] = await tx
        .update(workOrders)
        .set({
          scheduledStart: newStart,
          scheduledEnd: newEnd,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.organizationId, input.organizationId)))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'work_order',
        entityId: input.workOrderId,
        action: 'update',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'schedule', scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd },
      })
      return rowToContract(after!)
    })
    await emit(workOrderScheduled, {
      organizationId: input.organizationId,
      entityId: result.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      propertyId: result.propertyId,
      workOrderNumber: result.workOrderNumber,
      scheduledStart: result.scheduledStart,
      scheduledEnd: result.scheduledEnd,
    })
    return result
  }

  async startSlot(input: {
    workOrderId: string
    tradeSlotId: string
    organizationId: string
  }): Promise<WorkOrder> {
    return await this.mutateSlot(
      input.workOrderId,
      input.organizationId,
      (slot) =>
        slot.id === input.tradeSlotId
          ? slot.status === 'completed' || slot.status === 'in_progress'
            ? slot
            : { ...slot, status: 'in_progress', actualStart: new Date().toISOString() }
          : slot,
      'state_change',
      { kind: 'start_slot', tradeSlotId: input.tradeSlotId },
    )
  }

  async completeSlot(input: {
    workOrderId: string
    tradeSlotId: string
    organizationId: string
    actualHours: number
    notes?: string | null
  }): Promise<WorkOrder> {
    return await this.mutateSlot(
      input.workOrderId,
      input.organizationId,
      (slot) =>
        slot.id === input.tradeSlotId
          ? {
              ...slot,
              status: 'completed',
              actualCompletion: new Date().toISOString(),
              actualHours: input.actualHours,
              notes: input.notes ?? slot.notes,
            }
          : slot,
      'state_change',
      { kind: 'complete_slot', tradeSlotId: input.tradeSlotId, actualHours: input.actualHours },
    )
  }

  async costRollup(input: {
    workOrderId: string
    organizationId: string
  }): Promise<{ estimatedHours: number; actualHours: number; varianceHours: number }> {
    const wo = await this.get(input.workOrderId, input.organizationId)
    if (!wo) throw new Error('Work order not found')
    const estimatedHours = wo.tradeSlots.reduce((acc, s) => acc + (s.estimatedHours ?? 0), 0)
    const actualHours = wo.tradeSlots.reduce((acc, s) => acc + (s.actualHours ?? 0), 0)
    return { estimatedHours, actualHours, varianceHours: actualHours - estimatedHours }
  }

  /**
   * W2-3 / EH-G internal helper: append text to the `notes` column.
   * Used by RealChangeOrderService.approve via factory hook.
   */
  async appendNote(workOrderId: string, organizationId: string, note: string): Promise<WorkOrder> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.id, workOrderId), eq(workOrders.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Work order not found')
      const merged = before.notes ? `${before.notes}\n${note}` : note
      const [after] = await tx
        .update(workOrders)
        .set({ notes: merged, updatedAt: new Date() })
        .where(and(eq(workOrders.id, workOrderId), eq(workOrders.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'work_order',
        entityId: workOrderId,
        action: 'update',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'append_note' },
      })
      return rowToContract(after!)
    })
  }

  // --- internals ----------------------------------------------------------
  private async mutateSlot(
    workOrderId: string,
    organizationId: string,
    map: (slot: DbWO['tradeSlots'][number]) => DbWO['tradeSlots'][number],
    auditAction: string,
    auditMeta: Record<string, unknown>,
  ): Promise<WorkOrder> {
    const { result, prevStatus } = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.id, workOrderId), eq(workOrders.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Work order not found')
      const newSlots = before.tradeSlots.map(map)
      const newStatus = deriveEnvelopeStatus(newSlots)
      const [after] = await tx
        .update(workOrders)
        .set({ tradeSlots: newSlots, status: newStatus, updatedAt: new Date() })
        .where(and(eq(workOrders.id, workOrderId), eq(workOrders.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'work_order',
        entityId: workOrderId,
        // Audit contract enum is fixed; map our friendly action name onto
        // 'update' (assign_trade) / 'state_change' (slot status).
        action: auditAction === 'state_change' ? 'state_change' : 'update',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: auditAction, ...auditMeta },
      })
      return { result: rowToContract(after!), prevStatus: before.status }
    })
    // Post-transaction emit on envelope-status transitions (ADR-0017).
    if (prevStatus !== result.status) {
      const base = {
        organizationId,
        entityId: result.id,
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        timestamp: new Date().toISOString(),
        propertyId: result.propertyId,
        workOrderNumber: result.workOrderNumber,
      }
      if (result.status === 'in_progress') await emit(workOrderStarted, base)
      else if (result.status === 'completed') await emit(workOrderCompleted, base)
    }
    return result
  }

  private async nextWorkOrderNumber(organizationId: string): Promise<string> {
    // EH-H / W1-3: tenant-configurable format.
    const settings = await new RealOrgSettingsService(this.tenantResolver).get(organizationId)
    const format = settings.woNumberFormat
    const year = new Date().getUTCFullYear()
    const likePattern = buildLikePatternForYear(format, year)
    const db = getDb()
    const [row] = await db
      .select({ n: count() })
      .from(workOrders)
      .where(and(eq(workOrders.organizationId, organizationId), like(workOrders.workOrderNumber, likePattern)))
    const seq = Number(row?.n ?? 0) + 1
    return formatSequentialNumber({ format, year, seq })
  }

  /**
   * W3-3 / EH-M (ADR-0029) — "My Day" feed for a field user.
   *
   * Returns WOs in the org that:
   *   - are not deleted / cancelled
   *   - have `scheduledStart` within `[dateFrom, dateTo)` (inclusive
   *     start, exclusive end — caller passes a one-day window for
   *     "today")
   *
   * # Decisions (ADR-0008)
   *   - v1 scope: we do NOT yet link field users to specific WOs at
   *     the slot level — `tradeSlots[].assignedSubcontractorId` is a
   *     subcontractor company id, not a user id, and the contract has
   *     no `assignedToUserId` field. Until that landing slot exists,
   *     the field "My Day" surfaces every scheduled WO in the active
   *     org for the requested day. The `userId` arg is accepted so
   *     the call site stays stable when slot-level assignment lands
   *     (see W3+ promotion note in ADR-0029).
   *   - Tenant firewall via `assertSameTenant` mirrors the rest of
   *     the file. Pure read — no audit row.
   */
  async listForFieldUser(input: {
    organizationId: string
    userId: string
    dateFrom: string
    dateTo: string
  }): Promise<WorkOrder[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const from = new Date(input.dateFrom)
    const to = new Date(input.dateTo)
    const rows = await db
      .select()
      .from(workOrders)
      .where(
        and(
          eq(workOrders.organizationId, input.organizationId),
          sql`${workOrders.deletedAt} IS NULL`,
          sql`${workOrders.status} <> 'cancelled'`,
          sql`${workOrders.scheduledStart} >= ${from}`,
          sql`${workOrders.scheduledStart} < ${to}`,
        ),
      )
      .orderBy(workOrders.scheduledStart)
    // userId is reserved for slot-level filter (see method header).
    void input.userId
    return rows.map(rowToContract)
  }
}

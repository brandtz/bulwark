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
    return await withAudit(async ({ tx, audit }) => {
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

  // --- internals ----------------------------------------------------------
  private async mutateSlot(
    workOrderId: string,
    organizationId: string,
    map: (slot: DbWO['tradeSlots'][number]) => DbWO['tradeSlots'][number],
    auditAction: string,
    auditMeta: Record<string, unknown>,
  ): Promise<WorkOrder> {
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.id, workOrderId), eq(workOrders.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Work order not found')
      const newSlots = before.tradeSlots.map(map)
      const [after] = await tx
        .update(workOrders)
        .set({ tradeSlots: newSlots, updatedAt: new Date() })
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
      return rowToContract(after!)
    })
  }

  private async nextWorkOrderNumber(organizationId: string): Promise<string> {
    const year = new Date().getUTCFullYear()
    const prefix = `WO-${year}-`
    const db = getDb()
    const [row] = await db
      .select({ n: count() })
      .from(workOrders)
      .where(and(eq(workOrders.organizationId, organizationId), like(workOrders.workOrderNumber, `${prefix}%`)))
    const seq = Number(row?.n ?? 0) + 1
    return `${prefix}${String(seq).padStart(4, '0')}`
  }
}

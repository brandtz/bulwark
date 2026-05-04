/**
 * shared/mocks/work-order.mock.ts — MockWorkOrderService (E6).
 *
 * # Decisions (ADR-0008)
 *   - Module-level `rows[]` seeded from FIXTURE_WORK_ORDERS so the
 *     detail page renders something on first paint without a build flow.
 *   - Tenant firewall (E2-S7) on every method.
 *   - Org-scoped `WO-YYYY-NNNN` sequence on `create`, mirroring the
 *     quote-number convention in `quote.mock.ts`.
 *   - `assignTrade` and `updateTradeStatus` mutate the slot in-place;
 *     they also recompute the envelope status when slots progress
 *     (any in_progress \u2192 envelope is in_progress; all completed \u2192
 *     envelope is completed).
 *   - Idempotency: `assignTrade(\u2026 null)` clears the assignment and
 *     resets the slot status to `unassigned`. `updateTradeStatus` to
 *     the same status is a no-op.
 *
 * # Decision cast down
 *   - Rejected: writing an audit-log row per state change. The audit
 *     epic (E10) introduces that surface; not v1.
 */
import type {
  IWorkOrderService,
  WorkOrder,
  WorkOrderCreateInput,
  WorkOrderListInput,
  WorkOrderListOutput,
  TradeSlot,
  TradeSlotStatus,
  WorkOrderStatus,
} from '../contracts/work-order'
import { FIXTURE_WORK_ORDERS } from './fixtures'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: WorkOrder[] = [...FIXTURE_WORK_ORDERS]
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

function nextWorkOrderNumber(organizationId: string): string {
  const year = new Date().getUTCFullYear()
  const prefix = `WO-${year}-`
  const seq =
    rows.filter(
      (r) => r.organizationId === organizationId && r.workOrderNumber.startsWith(prefix),
    ).length + 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

function deriveEnvelopeStatus(slots: TradeSlot[]): WorkOrderStatus {
  if (slots.length === 0) return 'draft'
  if (slots.every((s) => s.status === 'completed')) return 'completed'
  if (slots.some((s) => s.status === 'in_progress')) return 'in_progress'
  if (slots.every((s) => s.status === 'unassigned')) return 'draft'
  return 'scheduled'
}

export class MockWorkOrderService implements IWorkOrderService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: WorkOrderListInput): Promise<WorkOrderListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter(
      (r) => r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (input.propertyId) {
      scoped = scoped.filter((r) => r.propertyId === input.propertyId)
    }
    if (input.status) {
      scoped = scoped.filter((r) => r.status === input.status)
    }
    scoped = scoped.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<WorkOrder | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(
      (x) => x.id === id && x.organizationId === organizationId && !x.deletedAt,
    )
    return r ?? null
  }

  async create(input: WorkOrderCreateInput): Promise<WorkOrder> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = nowIso()
    const slots = input.tradeSlots.map((s) => ({ ...s, id: newId() }))
    const row: WorkOrder = {
      id: newId(),
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      quoteId: input.quoteId,
      workOrderNumber: nextWorkOrderNumber(input.organizationId),
      status: deriveEnvelopeStatus(slots),
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      tradeSlots: slots,
      materials: input.materials.map((m) => ({ ...m, id: newId() })),
      notes: input.notes ?? null,
      createdById: input.createdById,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.unshift(row)
    return row
  }

  async assignTrade(
    workOrderId: string,
    tradeSlotId: string,
    subcontractorId: string | null,
    organizationId: string,
  ): Promise<WorkOrder> {
    assertSameTenant(this.tenantResolver, organizationId)
    const row = this.findOrThrow(workOrderId, organizationId)
    const slot = row.tradeSlots.find((s) => s.id === tradeSlotId)
    if (!slot) {
      throw new Error(`Trade slot ${tradeSlotId} not found on WO ${workOrderId}`)
    }
    slot.assignedSubcontractorId = subcontractorId
    if (subcontractorId === null && slot.status === 'assigned') {
      slot.status = 'unassigned'
    } else if (subcontractorId !== null && slot.status === 'unassigned') {
      slot.status = 'assigned'
    }
    row.status = deriveEnvelopeStatus(row.tradeSlots)
    row.updatedAt = nowIso()
    return row
  }

  async updateTradeStatus(
    workOrderId: string,
    tradeSlotId: string,
    status: TradeSlotStatus,
    organizationId: string,
  ): Promise<WorkOrder> {
    assertSameTenant(this.tenantResolver, organizationId)
    const row = this.findOrThrow(workOrderId, organizationId)
    const slot = row.tradeSlots.find((s) => s.id === tradeSlotId)
    if (!slot) {
      throw new Error(`Trade slot ${tradeSlotId} not found on WO ${workOrderId}`)
    }
    if (slot.status === status) return row
    slot.status = status
    row.status = deriveEnvelopeStatus(row.tradeSlots)
    row.updatedAt = nowIso()
    return row
  }

  private findOrThrow(workOrderId: string, organizationId: string): WorkOrder {
    const row = rows.find(
      (r) => r.id === workOrderId && r.organizationId === organizationId && !r.deletedAt,
    )
    if (!row) {
      throw new Error(`Work order ${workOrderId} not found in org ${organizationId}`)
    }
    return row
  }
}

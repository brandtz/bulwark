/**
 * shared/contracts/work-order.ts — Work order domain (E6).
 *
 * # Decisions (ADR-0008)
 *   - A WorkOrder is the GC-side execution record for an accepted quote.
 *     It owns one or more `TradeSlot` rows; each slot is the unit of
 *     scheduling + sub assignment. Status lives at both the WO level
 *     (envelope) and the slot level (per-trade progress).
 *   - We deliberately denormalize the trade schedule onto the WO row
 *     (JSON column once we wire SQL). Reading a WO is a single round
 *     trip; the per-trade progress doesn't need its own service.
 *   - `quoteId` is required: a WO can only be created from an accepted
 *     quote (per BRD §6.4). The mock service enforces this even though
 *     UI is the gate today.
 *   - Sub assignment is nullable per slot \u2014 "unassigned" is a real
 *     state that gates scheduling.
 *
 * # Decision cast down
 *   - Rejected: a separate `work_order_trades` table. Same trade-off as
 *     quote line items \u2014 read cost dominates at our scale.
 *   - Rejected: gantt-style scheduling. v1 stores a `scheduledStart` per
 *     slot and lets the field crew see a list, not a chart. ADR will
 *     revisit when a customer asks.
 */
import { z } from 'zod'
import {
  AuditFieldsSchema,
  ListOutputSchema,
  MoneyCentsSchema,
  PaginationInputSchema,
  UuidSchema,
} from './_shared'
import { TradeSchema } from './subcontractor'

// ----------------------------------------------------------------------------
// Status enums.
// ----------------------------------------------------------------------------
export const WorkOrderStatusSchema = z.enum([
  'draft',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
])
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>

export const TradeSlotStatusSchema = z.enum([
  'unassigned',
  'assigned',
  'in_progress',
  'completed',
  'blocked',
])
export type TradeSlotStatus = z.infer<typeof TradeSlotStatusSchema>

// ----------------------------------------------------------------------------
// Trade slot \u2014 one row in a work order.
// ----------------------------------------------------------------------------
export const TradeSlotSchema = z.object({
  id: UuidSchema,
  trade: TradeSchema,
  description: z.string().min(1).max(500),
  status: TradeSlotStatusSchema,
  assignedSubcontractorId: UuidSchema.nullable(),
  scheduledStart: z.string().datetime().nullable(),
  scheduledEnd: z.string().datetime().nullable(),
  notes: z.string().nullable(),
})
export type TradeSlot = z.infer<typeof TradeSlotSchema>

// ----------------------------------------------------------------------------
// Materials list \u2014 informational on the WO; v1 is a name + qty + unit.
// ----------------------------------------------------------------------------
export const MaterialItemSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
  unitCostCents: MoneyCentsSchema,
})
export type MaterialItem = z.infer<typeof MaterialItemSchema>

// ----------------------------------------------------------------------------
// Work-order record.
// ----------------------------------------------------------------------------
export const WorkOrderSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    propertyId: UuidSchema,
    quoteId: UuidSchema,
    workOrderNumber: z.string().min(1).max(40),
    status: WorkOrderStatusSchema,
    scheduledStart: z.string().datetime().nullable(),
    scheduledEnd: z.string().datetime().nullable(),
    tradeSlots: z.array(TradeSlotSchema),
    materials: z.array(MaterialItemSchema),
    notes: z.string().nullable(),
    createdById: UuidSchema,
  })
  .merge(AuditFieldsSchema)
export type WorkOrder = z.infer<typeof WorkOrderSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const WorkOrderCreateInputSchema = WorkOrderSchema.omit({
  id: true,
  workOrderNumber: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
})
export type WorkOrderCreateInput = z.infer<typeof WorkOrderCreateInputSchema>

export const WorkOrderListInputSchema = PaginationInputSchema.extend({
  organizationId: UuidSchema,
  propertyId: UuidSchema.optional(),
  status: WorkOrderStatusSchema.optional(),
})
export type WorkOrderListInput = z.infer<typeof WorkOrderListInputSchema>

export const WorkOrderListOutputSchema = ListOutputSchema(WorkOrderSchema)
export type WorkOrderListOutput = z.infer<typeof WorkOrderListOutputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IWorkOrderService {
  list(input: WorkOrderListInput): Promise<WorkOrderListOutput>
  get(id: string, organizationId: string): Promise<WorkOrder | null>
  create(input: WorkOrderCreateInput): Promise<WorkOrder>
  /** Assign a subcontractor to a trade slot. Pass `null` to clear. */
  assignTrade(
    workOrderId: string,
    tradeSlotId: string,
    subcontractorId: string | null,
    organizationId: string,
  ): Promise<WorkOrder>
  /** Update a trade slot's status (assigned \u2192 in_progress \u2192 completed). */
  updateTradeStatus(
    workOrderId: string,
    tradeSlotId: string,
    status: TradeSlotStatus,
    organizationId: string,
  ): Promise<WorkOrder>
}

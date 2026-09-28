/**
 * server/db/schema/work_orders.ts — Work-order execution (E6 / E11-S8).
 *
 * Trade slots + materials are JSONB on the row per the contract
 * decision. Per-slot status updates rewrite the JSONB array in a
 * single UPDATE; a separate `work_order_trades` table buys nothing
 * at our scale.
 */
import { sql } from 'drizzle-orm'
import { pgTable, text, uuid, pgEnum, jsonb, timestamp, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { properties } from './properties'
import { quotes } from './quotes'
import { users } from './users'
import type { TradeSlot, MaterialItem } from '../../../shared/contracts/work-order'

export const workOrderStatusEnum = pgEnum('work_order_status', [
  'draft',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
])

/** W2-3 / EH-G — dispatch priority. */
export const workOrderPriorityEnum = pgEnum('work_order_priority', [
  'low',
  'normal',
  'high',
  'urgent',
])

export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    propertyId: uuid('property_id').notNull().references(() => properties.id),
    quoteId: uuid('quote_id').notNull().references(() => quotes.id),
    workOrderNumber: text('work_order_number').notNull(),
    status: workOrderStatusEnum('status').notNull().default('draft'),
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }),
    tradeSlots: jsonb('trade_slots').$type<TradeSlot[]>().notNull(),
    materials: jsonb('materials').$type<MaterialItem[]>().notNull(),
    notes: text('notes'),
    createdById: uuid('created_by_id').notNull().references(() => users.id),
    // W2-3 / EH-G — scheduling + priority + cost rollup.
    estimatedHours: doublePrecision('estimated_hours').notNull().default(0),
    actualHours: doublePrecision('actual_hours').notNull().default(0),
    priority: workOrderPriorityEnum('priority').notNull().default('normal'),
    dispatchNotes: text('dispatch_notes'),
    ...auditColumns,
  },
  (t) => ({
    // WP-L06 S1/S2: hot list queries + per-org number uniqueness.
    orgNumberUnique: uniqueIndex('work_orders_org_number_unique').on(t.organizationId, t.workOrderNumber),
    orgStatusCreated: index('work_orders_org_status_created_idx').on(t.organizationId, t.status, t.createdAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    // Default list (no status filter): org + live rows, newest first.
    orgCreated: index('work_orders_org_created_idx').on(t.organizationId, t.createdAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    orgProperty: index('work_orders_org_property_idx').on(t.organizationId, t.propertyId),
  }),
)

export type WorkOrder = typeof workOrders.$inferSelect
export type NewWorkOrder = typeof workOrders.$inferInsert

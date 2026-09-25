/** Persisted generated artifacts owned by a property and its work orders. */
import { pgTable, text, uuid, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { properties } from './properties'
import { jobs } from './jobs'
import type { DeliverableSignature } from '../../../shared/contracts/deliverable'

export const deliverableKindEnum = pgEnum('deliverable_kind', [
  'compliance_package',
  'completion_report',
  'warranty_certificate',
  'custom',
])

export const deliverableStatusEnum = pgEnum('deliverable_status', [
  'draft',
  'generating',
  'ready',
  'failed',
  'cancelled',
])

export const deliverables = pgTable('deliverables', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  kind: deliverableKindEnum('kind').notNull().default('compliance_package'),
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  workOrderIds: jsonb('work_order_ids').$type<string[]>().notNull(),
  includedSlotIds: jsonb('included_slot_ids').$type<string[]>().notNull(),
  signature: jsonb('signature').$type<DeliverableSignature>().notNull(),
  jobId: uuid('job_id').references(() => jobs.id),
  status: deliverableStatusEnum('status').notNull().default('generating'),
  resultUrl: text('result_url'),
  error: text('error'),
  ...auditColumns,
})

export type Deliverable = typeof deliverables.$inferSelect
export type NewDeliverable = typeof deliverables.$inferInsert
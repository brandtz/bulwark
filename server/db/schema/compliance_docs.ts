/**
 * server/db/schema/compliance_docs.ts — generated compliance artifacts (E7 / E11-S10).
 *
 * The signature blob is stored inline as JSONB. In real deployments the
 * `dataUrl` will be replaced with an R2 object URL; the schema is
 * indifferent — both are strings.
 */
import { pgTable, text, uuid, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { properties } from './properties'
import { jobs } from './jobs'
import type { ComplianceSignature } from '../../../shared/contracts/compliance'

export const complianceDocStatusEnum = pgEnum('compliance_doc_status', [
  'draft',
  'generating',
  'ready',
  'failed',
  'cancelled',
])

export const complianceDocs = pgTable('compliance_docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  workOrderIds: jsonb('work_order_ids').$type<string[]>().notNull(),
  includedSlotIds: jsonb('included_slot_ids').$type<string[]>().notNull(),
  signature: jsonb('signature').$type<ComplianceSignature>().notNull(),
  jobId: uuid('job_id').references(() => jobs.id),
  status: complianceDocStatusEnum('status').notNull().default('generating'),
  resultUrl: text('result_url'),
  error: text('error'),
  ...auditColumns,
})

export type ComplianceDoc = typeof complianceDocs.$inferSelect
export type NewComplianceDoc = typeof complianceDocs.$inferInsert

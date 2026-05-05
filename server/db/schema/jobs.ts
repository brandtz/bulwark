/**
 * server/db/schema/jobs.ts — async job queue (E7 / E11-S9).
 *
 * Backed by `pg-boss` in production (per ADR-0012). pg-boss provisions
 * its own `pgboss` schema; this table is OUR job-row mirror so the
 * compliance-doc and other consumers can join + filter without leaking
 * pg-boss internals into the read path.
 */
import { pgTable, text, uuid, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const jobStatusEnum = pgEnum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
])

export const jobKindEnum = pgEnum('job_kind', ['compliance_doc'])

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  kind: jobKindEnum('kind').notNull(),
  status: jobStatusEnum('status').notNull().default('queued'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  resultUrl: text('result_url'),
  error: text('error'),
  ...auditColumns,
})

export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert

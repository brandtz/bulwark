/**
 * server/db/schema/audit_log.ts — append-only audit trail (E11-S2).
 *
 * Per ADR-0002, every write transaction must produce one audit row.
 * Schema is intentionally narrow: who, when, on what, what changed.
 *
 * `entityType` is a free-text discriminator (e.g. 'property', 'quote')
 * rather than a postgres enum so adding new entity kinds doesn't
 * require a migration. The `before`/`after` JSONB blobs are the
 * canonical diff source.
 */
import { pgTable, text, uuid, jsonb } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { users } from './users'

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  /** Free-text: 'property', 'quote', 'work_order', etc. */
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  /** 'create' | 'update' | 'delete' | 'state_change' */
  action: text('action').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  /** Free-form context the writer wants to preserve (e.g. status transition). */
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  before: jsonb('before').$type<Record<string, unknown> | null>(),
  after: jsonb('after').$type<Record<string, unknown> | null>(),
  ...auditColumns,
})

export type AuditLog = typeof auditLog.$inferSelect
export type NewAuditLog = typeof auditLog.$inferInsert

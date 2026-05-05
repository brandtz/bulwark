/**
 * server/db/schema/api_keys.ts — programmatic credentials (E9-S7 / E11-S12).
 *
 * Issue-once: only the bcrypt-style hash of the secret is persisted.
 * `prefix` is the leading ~10 chars of the raw secret (already shipped
 * by the mock service) so the UI can disambiguate keys without
 * exposing the rest.
 */
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { users } from './users'

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  label: text('label').notNull(),
  prefix: text('prefix').notNull(),
  /** bcrypt hash of the raw secret. Null only during issue-once race window. */
  secretHash: text('secret_hash').notNull(),
  createdById: uuid('created_by_id').references(() => users.id),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...auditColumns,
})

export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert

/**
 * server/db/schema/clients.ts — homeowners / property owners.
 *
 * Clients can own multiple properties. Phone is required (we call them);
 * email is optional (older clients don't always have one).
 */
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,

  fullName: text('full_name').notNull(),
  email: text('email'),
  phone: text('phone').notNull(),
  preferredContact: text('preferred_contact'), // 'email' | 'phone' | 'sms'
  notes: text('notes'),

  ...auditColumns,
})

export type Client = typeof clients.$inferSelect

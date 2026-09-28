/**
 * server/db/schema/people.ts — org-scoped people (WP-X2, ED-036).
 *
 * One person, many properties: `contacts` becomes the join
 * (property_id, person_id, kind, is_primary, is_billing). Portal invites attach
 * to the person. `primaryEmail` is lowercased and unique per org among live
 * rows, which is also the dedupe key the 0021 backfill used.
 */
import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** Lowercased canonical email (null when only a phone is known). */
    primaryEmail: text('primary_email'),
    emails: jsonb('emails').$type<string[]>().notNull().default([]),
    phones: jsonb('phones').$type<string[]>().notNull().default([]),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    orgEmailUnique: uniqueIndex('people_org_email_unique').on(t.organizationId, t.primaryEmail).where(sql`${t.primaryEmail} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    orgName: index('people_org_name_idx').on(t.organizationId, t.lastName, t.firstName),
  }),
)

export type PersonRow = typeof people.$inferSelect

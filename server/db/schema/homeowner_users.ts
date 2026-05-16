/**
 * server/db/schema/homeowner_users.ts — homeowner portal membership join
 * (W3-4 / EH-O / ADR-0032).
 *
 * # Decisions (ADR-0008, ADR-0032)
 *   - A homeowner is a regular `users` row + membership row whose role
 *     is `homeowner`, plus one of these rows per property they own /
 *     occupy. `(organizationId, propertyId, userId)` is unique so an
 *     individual can't be double-linked to the same property.
 *   - `kind` carries the human relationship to the property (owner,
 *     tenant, spouse, other). It's stored as `text` rather than a
 *     pg enum because the values are open-ended (some states care
 *     about additional relationships like "trustee" or "POA").
 *     Default is `owner` to match the most common case.
 *   - We DON'T store the homeowner's preferred contact channel here;
 *     that's on the `users` row. A "portal" invite is just a regular
 *     pending_invites row with role=`homeowner`.
 *
 * # Decision cast down
 *   - Rejected: a single `customer` table tying homeowner + commercial
 *     property owner together. Commercial owners are a Phase 2 surface
 *     (different consent + tax + invoicing). For v1, homeowner is a
 *     residential portal user keyed by property.
 */
import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { users } from './users'
import { properties } from './properties'

export const homeownerUsers = pgTable(
  'homeowner_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    propertyId: uuid('property_id').notNull().references(() => properties.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    /** Relationship to the property: owner | tenant | spouse | other. */
    kind: text('kind').notNull().default('owner'),
    invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    membershipUnique: uniqueIndex('homeowner_users_unique').on(
      t.organizationId,
      t.propertyId,
      t.userId,
    ),
  }),
)

export type HomeownerUserRow = typeof homeownerUsers.$inferSelect
export type NewHomeownerUserRow = typeof homeownerUsers.$inferInsert

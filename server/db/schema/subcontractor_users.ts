/**
 * server/db/schema/subcontractor_users.ts — sub portal membership join
 * (W3-4 / EH-N / ADR-0031).
 *
 * # Decisions (ADR-0008, ADR-0031)
 *   - A subcontractor "user" is a regular `users` row PLUS a row here.
 *     The user.role = `sub_contractor` on the GC's membership row;
 *     this join tells us WHICH subcontractor org they speak for.
 *   - One user can speak for multiple sub orgs across GCs in theory
 *     (a roofing crew that subs to two GCs); the unique constraint
 *     covers `(organizationId, subcontractorId, userId)` so a single
 *     human isn't double-attached to the same sub.
 *   - `invitedAt` / `acceptedAt` are derived from the matching
 *     `pending_invites` row at invite time; the audit trail lives in
 *     `audit_log`. We DON'T duplicate the bcrypt token here — that
 *     stays in `pending_invites` (single source of truth for token
 *     lifecycle).
 *
 * # Decision cast down
 *   - Rejected: per-sub `permissions` JSON on this row. The sub portal
 *     is a constrained surface; a sub user can do everything the sub
 *     can do, full stop. If we need per-user perms later, add them
 *     via the existing `permissions` table keyed by `userId`.
 */
import { pgTable, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { users } from './users'
import { subcontractors } from './subcontractors'

export const subcontractorUsers = pgTable(
  'subcontractor_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    subcontractorId: uuid('subcontractor_id').notNull().references(() => subcontractors.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    membershipUnique: uniqueIndex('subcontractor_users_unique').on(
      t.organizationId,
      t.subcontractorId,
      t.userId,
    ),
  }),
)

export type SubcontractorUserRow = typeof subcontractorUsers.$inferSelect
export type NewSubcontractorUserRow = typeof subcontractorUsers.$inferInsert

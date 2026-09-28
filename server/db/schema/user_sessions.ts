/**
 * server/db/schema/user_sessions.ts — server-side record of every sign-in
 * (WP-X2, ED-015) so users can see and revoke their sessions (SH-31).
 *
 * The sealed session cookie carries the row id; the dispatcher refuses a
 * session whose row is revoked. `lastSeenAt` is touched at most once a minute.
 */
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** user | password_change | admin */
    revokedReason: text('revoked_reason'),
  },
  (t) => ({
    byUser: index('user_sessions_user_idx').on(t.userId, t.revokedAt),
  }),
)

export type UserSessionRow = typeof userSessions.$inferSelect

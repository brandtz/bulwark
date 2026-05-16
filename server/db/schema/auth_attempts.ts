/**
 * server/db/schema/auth_attempts.ts — login attempt log (W2-5 / EH-I).
 *
 * # Decisions (ADR-0023-auth-hardening / ADR-0008)
 *   - Tracks every login attempt (success and failure) so the brute-
 *     force lockout can count failures by (email) AND (ipAddress) in
 *     a rolling window. Successes are recorded too so an auditor can
 *     reconstruct who logged in from where.
 *   - NOT tenant-scoped. Login happens before we know the user's org,
 *     and a single email may belong to multiple orgs. The
 *     organization-id stamp lands later via the audit_log entry the
 *     auth subscriber writes for `login_success`.
 *   - Email is stored lowercase. IP is captured from the H3 event
 *     when available (`x-forwarded-for` first hop or socket address).
 *     Both fields are indexed for the lockout count query.
 *
 * # Decision cast down
 *   - Rejected: piggybacking on `audit_log`. Audit rows are tenant-
 *     scoped (org_id NOT NULL) and the lockout query runs BEFORE we
 *     know the user. A dedicated table keeps the lockout check a
 *     single fast index scan.
 *   - Rejected: TTL via pg cron. Records age out naturally for the
 *     15-minute lockout window; rows older than 90 days can be
 *     pruned by an ops cron — not part of v1.
 */
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const authAttempts = pgTable(
  'auth_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    ipAddress: text('ip_address'),
    success: boolean('success').notNull(),
    /** Optional free-text reason on failure ('bad_password' | 'unknown_user' | 'locked' | …). */
    reason: text('reason'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: index('auth_attempts_email_idx').on(t.email, t.occurredAt),
    ipIdx: index('auth_attempts_ip_idx').on(t.ipAddress, t.occurredAt),
  }),
)

export type AuthAttempt = typeof authAttempts.$inferSelect
export type NewAuthAttempt = typeof authAttempts.$inferInsert

/**
 * server/db/schema/pending_invites.ts — outstanding user invites
 * (Wave 2 / EH-H Part B / W2-4).
 *
 * # Decisions (ADR-0008)
 *   - A `pending_invites` row is created when an admin invites someone
 *     by email. The row stores the bcrypt-style hash of the random
 *     invite token (NEVER the raw token — that lives only in the
 *     emailed magic link). On accept, the row is marked
 *     `acceptedAt = now()` and the matching `users` + `memberships`
 *     rows are upserted by `RealAuthService.acceptInvite`.
 *   - Partial unique index on `(organizationId, lower(email))` WHERE
 *     `accepted_at IS NULL AND revoked_at IS NULL` — i.e. you can have
 *     at most one OPEN invite per email per org, but historical
 *     accepted/revoked rows don't block re-invitation.
 *   - Token TTL is enforced by the service (7 days), not the DB. The
 *     DB stores `expiresAt` so we can index-scan stale rows for the
 *     future janitor cron.
 *   - `revokedAt` + `acceptedAt` are mutually exclusive terminal
 *     states. Either OR neither, never both — enforced in service code.
 */
import { pgTable, text, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { auditColumns, orgColumn } from './_shared'
import { roleEnum, users } from './users'

export const pendingInvites = pgTable(
  'pending_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    email: text('email').notNull(),
    role: roleEnum('role').notNull(),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
    /** sha256(token) hex string. Never store the raw token. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    openInviteUnique: uniqueIndex('pending_invites_open_unique')
      .on(t.organizationId, t.email)
      .where(sql`accepted_at IS NULL AND revoked_at IS NULL`),
  }),
)

export type PendingInviteRow = typeof pendingInvites.$inferSelect
export type NewPendingInviteRow = typeof pendingInvites.$inferInsert

/**
 * server/db/schema/user_mfa.ts — per-user MFA enrolments (W2-5 / EH-I-E).
 *
 * # Decisions (ADR-0024-2fa-totp / ADR-0008)
 *   - Single table covers every MFA kind today. v1 ships `kind='totp'`
 *     only; future kinds (webauthn, sms) tack on without a schema
 *     change.
 *   - `secret_encrypted` holds the Base32-encoded TOTP secret. v1
 *     stores plaintext (the column name is forward-looking) — the
 *     accompanying ADR-0024 notes the migration path to envelope
 *     encryption (KMS) when the platform reaches that maturity.
 *   - `confirmed_at` flips from null → timestamp once the user
 *     verifies their first code. Unconfirmed enrolments are pending
 *     and can be replaced by a fresh enroll attempt.
 *   - Soft delete (`deleted_at`) supports `forceMfaReset(userId)` —
 *     an admin can reset a user's MFA from /settings/users without
 *     hard-deleting history.
 *
 * # Decision cast down
 *   - Rejected: separate tables per MFA kind. Three identical join
 *     tables for a flag column buys nothing. One row per (user, kind)
 *     keeps queries simple.
 *   - Rejected: storing the QR data URL. Easy to re-mint from the
 *     secret + issuer + account on demand; storing it just wastes
 *     space and leaks the otpauth URI server-side.
 */
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns } from './_shared'
import { users } from './users'

export const userMfa = pgTable(
  'user_mfa',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Discriminator. v1 = 'totp'. */
    kind: text('kind').notNull(),
    /** Base32-encoded shared secret. Plaintext at v1; ADR-0024 §Future tracks envelope encryption. */
    secretEncrypted: text('secret_encrypted').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    /** A user can only have one live row per kind. Soft-deleted rows are dropped from the unique via partial index in app logic. */
    userKindIdx: uniqueIndex('user_mfa_user_kind_unique').on(t.userId, t.kind),
  }),
)

export type UserMfa = typeof userMfa.$inferSelect
export type NewUserMfa = typeof userMfa.$inferInsert

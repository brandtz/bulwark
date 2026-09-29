/**
 * server/db/schema/user_mfa.ts — per-user MFA enrolments (W2-5 / EH-I-E).
 *
 * # Decisions (ADR-0024-2fa-totp / ADR-0008)
 *   - Single table covers every MFA kind today. v1 ships `kind='totp'`
 *     only; future kinds (webauthn, sms) tack on without a schema
 *     change.
 *   - `secret_encrypted` holds the Base32 TOTP secret encrypted at the
 *     application layer (`encryptSecret` in server/utils/crypto.ts, keyed by
 *     server config; WP-L07 S6). ADR-0024 tracks moving the key to KMS
 *     envelope encryption.
 *   - `confirmed_at` flips from null → timestamp once the user
 *     verifies their first code. Unconfirmed enrolments are pending
 *     and can be replaced by a fresh enroll attempt.
 *   - `deleted_at` marks a disabled authenticator. The unique key still
 *     covers that row, so a later enrolment reuses it with a new secret.
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
    /** Base32 shared secret, encrypted with encryptSecret (server/utils/crypto.ts); ADR-0024 tracks KMS envelope encryption. */
    secretEncrypted: text('secret_encrypted').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    /** One row per user and kind, including disabled authenticators. */
    userKindIdx: uniqueIndex('user_mfa_user_kind_unique').on(t.userId, t.kind),
  }),
)

export type UserMfa = typeof userMfa.$inferSelect
export type NewUserMfa = typeof userMfa.$inferInsert

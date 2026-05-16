/**
 * server/db/schema/mfa_backup_codes.ts — one-time recovery codes (W2-5 / EH-I-E).
 *
 * # Decisions (ADR-0024-2fa-totp)
 *   - Hash-stored. We persist `code_hash` (bcrypt), never the plain
 *     code. The plain codes are shown to the user EXACTLY ONCE at
 *     enrollment.
 *   - One-time use. `used_at` flips on consumption; no resurrection.
 *   - 10 codes per enrollment. Re-enrolling MFA replaces the whole
 *     set (delete old rows, insert ten new). v1 keeps it simple.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { auditColumns } from './_shared'
import { users } from './users'

export const mfaBackupCodes = pgTable('mfa_backup_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  /** bcrypt hash of the plain code shown to the user once. */
  codeHash: text('code_hash').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  ...auditColumns,
})

export type MfaBackupCode = typeof mfaBackupCodes.$inferSelect
export type NewMfaBackupCode = typeof mfaBackupCodes.$inferInsert

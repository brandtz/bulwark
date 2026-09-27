/**
 * server/db/schema/security_policies.ts — per-organization security policy
 * (WP-L07 S2, ADR-0006, ED-001, ED-015).
 *
 * One row per organization; a missing row means the defaults below, which
 * match the pre-L07 hard-coded behaviour (5 failures / 30 min lockout, MFA
 * optional, no idle timeout, 30-day trusted devices).
 */
import { integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const securityPolicies = pgTable(
  'security_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    /** disabled | optional | required */
    mfaMode: text('mfa_mode').notNull().default('optional'),
    /** Sign out after this many minutes without activity; null = no idle timeout. */
    idleMinutes: integer('idle_minutes'),
    lockoutAttempts: integer('lockout_attempts').notNull().default(5),
    lockoutMinutes: integer('lockout_minutes').notNull().default(30),
    /** "Keep me signed in" lifetime; ED-015 caps it at 90. */
    trustedDays: integer('trusted_days').notNull().default(30),
    updatedById: uuid('updated_by_id'),
    ...auditColumns,
  },
  (t) => ({
    orgUnique: uniqueIndex('security_policies_org_unique').on(t.organizationId),
  }),
)

export type SecurityPolicyRow = typeof securityPolicies.$inferSelect

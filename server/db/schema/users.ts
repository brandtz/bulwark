/**
 * server/db/schema/users.ts — global users + per-org membership join.
 *
 * Decisions:
 *   - Users are global (one row per real human across all orgs).
 *   - Membership rows carry the role (super_admin, org_admin, ...). A user
 *     can belong to multiple orgs with different roles each.
 *   - Roles are a Postgres enum so adding a new role is a migration, not a
 *     string typo waiting to happen.
 */
import { pgTable, text, uuid, pgEnum, boolean, primaryKey } from 'drizzle-orm/pg-core'
import { auditColumns } from './_shared'
import { organizations } from './organizations'

export const roleEnum = pgEnum('role', [
  'super_admin',
  'org_admin',
  'org_manager',
  'field',
  'sub_contractor',
  'viewer',
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash'), // null = SSO-only or invited-not-accepted
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').notNull().default(true),
  ...auditColumns,
})

export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id').notNull().references(() => users.id),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    role: roleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.organizationId] }) }),
)

export type User = typeof users.$inferSelect
export type Membership = typeof memberships.$inferSelect

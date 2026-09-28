/**
 * server/db/schema/push_subscriptions.ts — Web Push subscriptions
 * (WP-X3, ED-016: push as the 4th notification channel).
 *
 * One row per browser/device subscription (the push service `endpoint` is
 * globally unique). A user may have several devices. `revokedAt` is set on
 * unsubscribe or when the push service answers 404/410 (subscription gone), so
 * sends skip it without losing the audit trail. `p256dh` / `auth` are the
 * subscription's public key material (needed for encrypted payloads); they are
 * not secrets of ours.
 */
import { pgTable, text, timestamp, uniqueIndex, index, uuid } from 'drizzle-orm/pg-core'
import { orgColumn } from './_shared'
import { users } from './users'

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    endpointUnique: uniqueIndex('push_subscriptions_endpoint_unique').on(t.endpoint),
    orgUser: index('push_subscriptions_org_user_idx').on(t.organizationId, t.userId),
  }),
)

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect

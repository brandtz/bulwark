/**
 * server/db/schema/notification_subscriptions.ts — per-user × per-event
 * delivery preferences (Wave 2 / EH-H Part B / W2-4).
 *
 * # Decisions (ADR-0008)
 *   - One row per (org, user, eventType). The `channels` JSONB holds
 *     `{ inApp, email, sms }` booleans — three booleans per row keeps
 *     the matrix view trivially renderable.
 *   - Defaults live in code (`NOTIFICATION_DEFAULTS` in contract) so a
 *     fresh user is seeded sane on first login. The seed-on-create
 *     hook runs at acceptInvite time.
 *   - Channels NOT toggled here (push notifications, Slack, etc.) are
 *     out-of-scope for Phase 1. The JSONB shape is extensible.
 */
import { pgTable, text, uuid, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { users } from './users'

export interface NotificationChannels {
  inApp: boolean
  email: boolean
  sms: boolean
}

export const notificationSubscriptions = pgTable(
  'notification_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    channels: jsonb('channels').$type<NotificationChannels>().notNull().default({
      inApp: true,
      email: false,
      sms: false,
    }),
    ...auditColumns,
  },
  (t) => ({
    orgUserEventUnique: uniqueIndex('notification_subscriptions_org_user_event_unique').on(
      t.organizationId,
      t.userId,
      t.eventType,
    ),
  }),
)

export type NotificationSubscriptionRow = typeof notificationSubscriptions.$inferSelect
export type NewNotificationSubscriptionRow = typeof notificationSubscriptions.$inferInsert

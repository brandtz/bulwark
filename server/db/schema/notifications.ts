/**
 * server/db/schema/notifications.ts — per-user in-app notification feed
 * (W3-1 / EH-J / ADR-0027).
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - One row per delivered in-app notification. Email + SMS deliveries
 *     also write a row here so the feed becomes a single source of
 *     truth for "what reached this user, across what channels."
 *   - `eventType` is the dot-event-name (e.g. `quote.accepted`) that
 *     fanned-out to this row. Used to filter and to look up the
 *     template that rendered title/body at enqueue time.
 *   - `severity` is a four-state enum encoded as text so the column
 *     never blocks adding a new severity value (e.g. `critical`)
 *     behind a migration.
 *   - `relatedEntityType` + `relatedEntityId` carry the optional
 *     navigation target so the bell + feed can deep-link to the
 *     originating quote / invoice / WO.
 *   - `readAt` is nullable; `null` = unread. Index on (userId, readAt)
 *     keeps the bell badge `COUNT WHERE readAt IS NULL` cheap.
 *   - `userId` FK uses `ON DELETE CASCADE` so user cleanup in tests
 *     doesn't trip foreign-key constraints (mirrors
 *     `notification_subscriptions`).
 */
import { pgTable, text, uuid, timestamp, index } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { users } from './users'

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** `info | success | warning | error`. */
    severity: text('severity').notNull().default('info'),
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: uuid('related_entity_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    userUnreadIdx: index('notifications_user_unread_idx').on(t.userId, t.readAt),
    orgUserIdx: index('notifications_org_user_idx').on(t.organizationId, t.userId),
  }),
)

export type NotificationRow = typeof notifications.$inferSelect
export type NewNotificationRow = typeof notifications.$inferInsert

/**
 * server/db/schema/platform_announcements.ts — maintenance / platform notices
 * (WP-X2, ED-007). super_admin writes them; every shell renders active ones as
 * an info/warning banner; each user can dismiss.
 */
import { sql } from 'drizzle-orm'
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const platformAnnouncements = pgTable(
  'platform_announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    /** info | warning */
    tone: text('tone').notNull().default('info'),
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    active: index('platform_announcements_active_idx').on(t.startsAt, t.endsAt).where(sql`${t.deletedAt} IS NULL`),
  }),
)

export const announcementDismissals = pgTable(
  'announcement_dismissals',
  {
    announcementId: uuid('announcement_id').notNull().references(() => platformAnnouncements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.announcementId, t.userId] }),
  }),
)

import { pgTable, pgEnum, uuid, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const userThemePreferenceEnum = pgEnum('user_theme_preference', ['light', 'dark', 'system'])
export const userDensityPreferenceEnum = pgEnum('user_density_preference', ['comfortable', 'compact', 'touch', 'auto'])

export const userPrefs = pgTable('user_prefs', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  theme: userThemePreferenceEnum('theme').notNull().default('system'),
  density: userDensityPreferenceEnum('density').notNull().default('auto'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type UserPrefsRow = typeof userPrefs.$inferSelect
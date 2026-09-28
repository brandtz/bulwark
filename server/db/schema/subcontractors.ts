/**
 * server/db/schema/subcontractors.ts — Subcontractor CRM (E6 / E11-S8).
 *
 * `trades` is JSONB (a small array of trade enum strings) rather than
 * a join table. Few trades per sub, contract is full-replace on update.
 */
import { sql } from 'drizzle-orm'
import { pgTable, text, uuid, jsonb, pgEnum, timestamp, index } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import type { Trade } from '../../../shared/contracts/subcontractor'

export const tradeEnum = pgEnum('trade', [
  'roofing',
  'siding',
  'gutters',
  'eaves_vents',
  'defensible_space',
  'general_labor',
])

export const subcontractors = pgTable(
  'subcontractors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    companyName: text('company_name').notNull(),
    contactName: text('contact_name').notNull(),
    email: text('email'),
    phone: text('phone').notNull(),
    trades: jsonb('trades').$type<Trade[]>().notNull(),
    licenseNumber: text('license_number'),
    licenseExpiresAt: timestamp('license_expires_at', { withTimezone: true }),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    // WP-L06 S5: org-scoped list / lookup indexes (docs/DATA_LAYER.md).
    orgCreated: index('subcontractors_org_created_idx').on(t.organizationId, t.createdAt.desc()).where(sql`${t.deletedAt} IS NULL`),
  }),
)

export type Subcontractor = typeof subcontractors.$inferSelect
export type NewSubcontractor = typeof subcontractors.$inferInsert

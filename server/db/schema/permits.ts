/**
 * server/db/schema/permits.ts — permits, their jobs, and the jurisdictions
 * catalog (WP-X2, ED-039).
 *
 * Permits are property-scoped with an optional many-to-many to work orders
 * (`permit_jobs`). Jurisdictions are a per-tenant catalog plus free-text
 * "Other" on the permit itself.
 */
import { sql } from 'drizzle-orm'
import { index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { properties } from './properties'
import { workOrders } from './work_orders'

export const jurisdictions = pgTable(
  'jurisdictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    name: text('name').notNull(),
    /** Optional authority code (AHJ / county / city id). */
    code: text('code'),
    ...auditColumns,
  },
  (t) => ({
    orgName: uniqueIndex('jurisdictions_org_name_unique').on(t.organizationId, t.name).where(sql`${t.deletedAt} IS NULL`),
  }),
)

export const permits = pgTable(
  'permits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    propertyId: uuid('property_id').notNull().references(() => properties.id),
    jurisdictionId: uuid('jurisdiction_id').references(() => jurisdictions.id),
    /** Free-text jurisdiction when no catalog entry fits ("Other"). */
    jurisdictionOther: text('jurisdiction_other'),
    permitNumber: text('permit_number'),
    kind: text('kind').notNull().default('building'),
    /** draft | applied | issued | expired | closed */
    status: text('status').notNull().default('draft'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    orgProperty: index('permits_org_property_idx').on(t.organizationId, t.propertyId).where(sql`${t.deletedAt} IS NULL`),
    orgExpiry: index('permits_org_expires_idx').on(t.organizationId, t.expiresAt).where(sql`${t.deletedAt} IS NULL`),
  }),
)

export const permitJobs = pgTable(
  'permit_jobs',
  {
    ...orgColumn,
    permitId: uuid('permit_id').notNull().references(() => permits.id, { onDelete: 'cascade' }),
    workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.permitId, t.workOrderId] }),
    byWorkOrder: index('permit_jobs_work_order_idx').on(t.workOrderId),
  }),
)

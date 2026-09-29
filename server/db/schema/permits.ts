/**
 * server/db/schema/permits.ts — permits, their jobs, and the jurisdictions
 * catalog (WP-X2, ED-039).
 *
 * Permits are property-scoped with an optional many-to-many to work orders
 * (`permit_jobs`). Jurisdictions are a per-tenant catalog plus free-text
 * "Other" on the permit itself.
 */
import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { properties } from './properties'
import { propertyAttachments } from './property_attachments'
import { users } from './users'
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
    /** What the permit covers; printed on the completion report (AD-19). */
    scope: text('scope'),
    /** AD-19 statuses (ED-061); transitions are enforced by the service. */
    status: text('status').notNull().default('applied'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    notes: text('notes'),
    /** The permit PDF, an attachment on the same property (AD-19 / AD-18). */
    pdfAttachmentId: uuid('pdf_attachment_id').references(() => propertyAttachments.id),
    ...auditColumns,
  },
  (t) => ({
    statusCheck: check('permits_status_check', sql`${t.status} IN ('applied', 'issued', 'inspections_in_progress', 'final_approved', 'expired', 'withdrawn')`),
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

/**
 * Jurisdiction inspections and sign-offs on a permit (AD-19, ED-061). Distinct
 * from our own inspections (AD-21): the authority's inspector records the
 * result, we log it here.
 */
export const permitInspections = pgTable(
  'permit_inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    permitId: uuid('permit_id').notNull().references(() => permits.id),
    inspectionType: text('inspection_type').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    inspector: text('inspector'),
    /** null until recorded: passed | corrections_required | failed */
    result: text('result'),
    resultNote: text('result_note'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    resultCheck: check('permit_inspections_result_check', sql`${t.result} IS NULL OR ${t.result} IN ('passed', 'corrections_required', 'failed')`),
    byPermit: index('permit_inspections_permit_idx').on(t.organizationId, t.permitId).where(sql`${t.deletedAt} IS NULL`),
  }),
)

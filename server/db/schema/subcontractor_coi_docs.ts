/**
 * server/db/schema/subcontractor_coi_docs.ts — Certificate of Insurance
 * tracking for subcontractors (W3-4 / EH-N / ADR-0031).
 *
 * # Decisions (ADR-0008, ADR-0031)
 *   - Separate table from `compliance_docs`. The latter is the
 *     property-scoped wildfire compliance PDF (E7). A sub's COI is
 *     vendor-scoped, not property-scoped, and has a totally different
 *     lifecycle (annual renewals, expiry alerts, vendor-driven
 *     uploads). Conflating the two would force a polymorphic FK and
 *     hide the expiry alert path inside compliance code.
 *   - One file URL per row. We don't version COIs in v1 — when a new
 *     COI is uploaded we insert a new row and rely on `uploadedAt`
 *     desc + `expiresAt` for "current COI" computation. Old rows stay
 *     for audit.
 *   - Soft delete via `deletedAt`. Vendor turnover keeps the audit
 *     trail; an admin can hide old certs without losing history.
 */
import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { subcontractors } from './subcontractors'
import { users } from './users'

export const subcontractorCoiDocs = pgTable('subcontractor_coi_docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  subcontractorId: uuid('subcontractor_id').notNull().references(() => subcontractors.id),
  /** R2 / S3 object URL (or data URL in mock). */
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  /** Carrier-stated expiry date. Drives the 30-day warning job. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  notes: text('notes'),
  ...auditColumns,
})

export type SubcontractorCoiDocRow = typeof subcontractorCoiDocs.$inferSelect
export type NewSubcontractorCoiDocRow = typeof subcontractorCoiDocs.$inferInsert

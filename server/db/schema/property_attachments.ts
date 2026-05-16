/**
 * server/db/schema/property_attachments.ts — non-photo documents attached to a property (W2-1 / EH-E).
 *
 * # Decisions (ADR-0008, ADR-0018)
 *   - Distinct from `property_photos` so the UI can render the two
 *     surfaces differently (gallery vs document list) and so future
 *     OCR / mime-typed pipelines don't have to scan past JPEGs.
 *   - `kind` text taxonomy (`survey|plat|insurance|permit|other`) lets
 *     admins extend via the label registry. Service layer constrains
 *     to known kinds.
 *   - We do not store the binary in Postgres — `url` points to the
 *     storage backend (S3/R2 later; `local://attachments/<uuid>` stub
 *     in this slice).
 */
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const propertyAttachments = pgTable('property_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,

  propertyId: uuid('property_id').notNull(),

  // 'survey' | 'plat' | 'insurance' | 'permit' | 'other'
  kind: text('kind').notNull().default('other'),

  name: text('name').notNull(),
  url: text('url').notNull(),
  uploadedByUserId: uuid('uploaded_by_user_id'),

  ...auditColumns,
})

export type PropertyAttachment = typeof propertyAttachments.$inferSelect
export type NewPropertyAttachment = typeof propertyAttachments.$inferInsert

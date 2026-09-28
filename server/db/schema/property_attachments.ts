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
import { sql } from 'drizzle-orm'
import { pgTable, text, uuid, index, timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const propertyAttachments = pgTable(
  'property_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,

    propertyId: uuid('property_id').notNull(),

    // 'survey' | 'plat' | 'insurance' | 'permit' | 'other'
    kind: text('kind').notNull().default('other'),

    name: text('name').notNull(),
    url: text('url').notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id'),

    // WP-X3 / ED-00E: async malware scan. pending | clean | infected | skipped
    // (no scanner configured, or a row that predates scanning).
    scanStatus: text('scan_status').notNull().default('skipped'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),

    ...auditColumns,
  },
  (t) => ({
    // WP-L06 S5: org-scoped list / lookup indexes (docs/DATA_LAYER.md).
    orgProperty: index('property_attachments_org_property_idx').on(t.organizationId, t.propertyId).where(sql`${t.deletedAt} IS NULL`),
  }),
)

export type PropertyAttachment = typeof propertyAttachments.$inferSelect
export type NewPropertyAttachment = typeof propertyAttachments.$inferInsert

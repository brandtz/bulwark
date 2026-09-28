/**
 * server/db/schema/property_photos.ts — photo gallery for a property (W2-1 / EH-E).
 *
 * # Decisions (ADR-0008, ADR-0018)
 *   - Photos always pin to a property; building/section pins are optional
 *     so legacy "front of house" photos taken before structures are
 *     captured still have a home.
 *   - `url` holds the canonical URL (CDN/S3 once W3-1 wires real upload;
 *     `local://photos/<uuid>.jpg` stubs in this slice — see
 *     `property-photo.real.ts` for the seam).
 *   - `thumbnailUrl` is optional. We don't generate one in the stub —
 *     the UI falls back to `url` when thumbnail is missing.
 *   - `takenAt` separate from `createdAt`: EXIF "taken" timestamps are
 *     what field crews actually want to sort by; createdAt records the
 *     upload event. Both nullable-friendly: takenAt can be backfilled
 *     after the fact.
 */
import { sql } from 'drizzle-orm'
import { pgTable, text, uuid, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const propertyPhotos = pgTable(
  'property_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,

    propertyId: uuid('property_id').notNull(),
    buildingId: uuid('building_id'),
    sectionId: uuid('section_id'),

    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    caption: text('caption'),

    takenAt: timestamp('taken_at', { withTimezone: true }),
    uploadedByUserId: uuid('uploaded_by_user_id'),

    // WP-X3 / ED-00E: async malware scan. pending | clean | infected | skipped
    // (no scanner configured, or a row that predates scanning).
    scanStatus: text('scan_status').notNull().default('skipped'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),

    sortOrder: integer('sort_order').notNull().default(0),

    ...auditColumns,
  },
  (t) => ({
    // WP-L06 S5: org-scoped list / lookup indexes (docs/DATA_LAYER.md).
    orgPropertySort: index('property_photos_org_property_idx').on(t.organizationId, t.propertyId, t.sortOrder).where(sql`${t.deletedAt} IS NULL`),
  }),
)

export type PropertyPhoto = typeof propertyPhotos.$inferSelect
export type NewPropertyPhoto = typeof propertyPhotos.$inferInsert

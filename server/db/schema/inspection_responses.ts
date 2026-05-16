/**
 * server/db/schema/inspection_responses.ts — per-field capture rows
 * (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Decisions (ADR-0008, ADR-0019)
 *   - One row per (inspection, sectionInstanceKey, fieldSlug). The
 *     `sectionInstanceKey` discriminator is the repeatable-section seam:
 *     non-repeatable sections store responses under `<sectionSlug>`
 *     verbatim; repeatable sections store them under
 *     `<sectionSlug>-<instanceIndex>` (e.g. `roof-face-0`, `roof-face-1`)
 *     so multiple stamps of the same section coexist on one inspection.
 *   - Values are stored as JSONB so the same table handles every field
 *     kind without an N-column denormalisation. The evaluator + UI
 *     interpret `valueJson` per `field.kind` (string, number, bool,
 *     array, etc.).
 *   - `photosCount` is a denormalised tally so the editor can show
 *     "(3 photos)" badges without re-fetching photo rows. Photo content
 *     itself lives elsewhere (Wave 3 / W3-3 / R2 pipeline) — this column
 *     is metadata only.
 *   - Unique constraint on the triple guarantees the upsert path (the
 *     `saveResponses` bulk method) is idempotent: re-submitting the
 *     same key set updates rows in place.
 *
 * # Decision cast down
 *   - Rejected: one table per field kind. The shape difference is
 *     entirely value-payload; gaining N tables for one extra typed
 *     column on each is the wrong trade.
 *   - Rejected: storing all responses as a JSONB blob on the inspection
 *     row. Kills per-field editing UX (the saveResponses call would
 *     race), kills evaluator readability, and kills future "show me all
 *     properties where vent type was not ember-resistant" queries.
 */
import { pgTable, text, uuid, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { auditColumns } from './_shared'
import { inspections } from './inspections'

export const inspectionResponses = pgTable(
  'inspection_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inspectionId: uuid('inspection_id').notNull().references(() => inspections.id),
    sectionInstanceKey: text('section_instance_key').notNull(),
    fieldSlug: text('field_slug').notNull(),
    valueJson: jsonb('value_json').$type<unknown>(),
    photosCount: integer('photos_count').notNull().default(0),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    responseUnique: uniqueIndex('inspection_responses_unique').on(
      t.inspectionId, t.sectionInstanceKey, t.fieldSlug,
    ),
  }),
)

export type InspectionResponse = typeof inspectionResponses.$inferSelect
export type NewInspectionResponse = typeof inspectionResponses.$inferInsert

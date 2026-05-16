/**
 * server/db/schema/buildings.ts — physical structures attached to a property (W2-1 / EH-E).
 *
 * # Decisions (ADR-0008, ADR-0018)
 *   - A property can have many buildings: main house, ADU, detached garage,
 *     barn, shop, etc. Real GC upgrades (re-roofs, additions, electrical
 *     panels) routinely scope to a specific structure, not the parcel.
 *   - `kind` is a free-form text column rather than an enum so admins
 *     can introduce new building kinds via the label registry without a
 *     schema migration. Application code restricts to the known set
 *     (`house|adu|garage|barn|shop|other`).
 *   - `sortOrder` lets admins reorder building tiles on the property
 *     overview; default 0 means "freshly created sinks below pre-existing
 *     rows" which mirrors the contacts/sections convention.
 *   - All measurement fields nullable: lots of legacy data has none of
 *     these, and forcing zeros would corrupt downstream reporting.
 *
 * # Decision cast down
 *   - Rejected: a single JSONB `metadata` blob. Buildings carry typed
 *     fields that downstream services (assessments, inspection
 *     templates) want to filter on; jsonb defeats query plans and the
 *     contract Zod parsing.
 */
import { pgTable, text, uuid, integer } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const buildings = pgTable('buildings', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,

  propertyId: uuid('property_id').notNull(),

  name: text('name').notNull(),
  // 'house' | 'adu' | 'garage' | 'barn' | 'shop' | 'other'
  kind: text('kind').notNull().default('house'),

  yearBuilt: integer('year_built'),
  squareFeet: integer('square_feet'),
  stories: integer('stories'),

  constructionType: text('construction_type'),
  roofMaterial: text('roof_material'),
  sidingMaterial: text('siding_material'),

  notes: text('notes'),

  sortOrder: integer('sort_order').notNull().default(0),

  ...auditColumns,
})

export type Building = typeof buildings.$inferSelect
export type NewBuilding = typeof buildings.$inferInsert

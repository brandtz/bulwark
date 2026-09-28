/**
 * server/db/schema/properties.ts — the central entity Bulwark is built around.
 *
 * Every assessment, quote, work order, compliance doc, and invoice ties back
 * to a property. Pipeline status is the kanban column on /admin/pipeline (E3).
 */
import { sql } from 'drizzle-orm'
import { pgTable, text, uuid, integer, numeric, index } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,

    // Address
    addressLine1: text('address_line_1').notNull(),
    addressLine2: text('address_line_2'),
    city: text('city').notNull(),
    state: text('state').notNull(), // 2-letter
    postalCode: text('postal_code').notNull(),

    // Owner / client (FK in clients.ts)
    clientId: uuid('client_id'),

    // Pipeline
    status: text('status').notNull().default('lead'),

    // Free-text notes
    notes: text('notes'),

    // Geo (Phase 2 — populated by geocoding job)
    latitude: integer('latitude'), // microdegrees (lat * 1e6)
    longitude: integer('longitude'),

    // W2-1 / EH-E — richer property metadata (ADR-0018). All nullable so
    // legacy rows survive the migration; UI surfaces them as "—" when blank.
    lotSizeAcres: numeric('lot_size_acres', { precision: 12, scale: 4 }),
    parcelNumber: text('parcel_number'),
    yearBuilt: integer('year_built'),
    accessNotes: text('access_notes'),
    gateCode: text('gate_code'),
    specialInstructions: text('special_instructions'),
    // Soft FK to contacts.id — intentionally NOT a Drizzle reference because
    // contacts.propertyId points back here and a hard FK would form a cycle
    // that breaks bulk delete order. Service layer validates the link.
    primaryContactId: uuid('primary_contact_id'),

    ...auditColumns,
  },
  (t) => ({
    // WP-L06 S1/S2: hot list queries + per-org number uniqueness.
    orgStatusCreated: index('properties_org_status_created_idx').on(t.organizationId, t.status, t.createdAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    // Default list (no status filter): org + live rows, newest first.
    orgCreated: index('properties_org_created_idx').on(t.organizationId, t.createdAt.desc()).where(sql`${t.deletedAt} IS NULL`),
  }),
)

export type Property = typeof properties.$inferSelect
export type NewProperty = typeof properties.$inferInsert

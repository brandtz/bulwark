/**
 * server/db/schema/organizations.ts
 *
 * Tenants. Every tenant-scoped row in every other table FKs to this id.
 * ADR-0002: shared DB, organizationId column firewall at service layer.
 */
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { auditColumns } from './_shared'

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  brandColor: text('brand_color'), // optional per-tenant brand override (E9-S2)
  ...auditColumns,
})

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert

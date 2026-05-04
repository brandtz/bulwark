/**
 * server/db/schema/_shared.ts — column helpers shared across all tables
 *
 * Decisions captured here:
 *   - ADR-0002: every tenant-scoped table carries `organizationId`.
 *   - CONVENTIONS: every entity has createdAt / updatedAt / deletedAt
 *     (soft delete only — no hard DELETE outside admin scripts).
 *   - Money is integer cents — see `centsColumn`.
 *
 * Decisions NOT taken:
 *   - We don't use Postgres `IDENTITY` PKs — UUID v4 is generated client-side
 *     so optimistic UI can attach an id before the round-trip lands (E11).
 */
import { pgTable, uuid, timestamp, integer } from 'drizzle-orm/pg-core'

/** Standard audit columns. Spread into every entity table. */
export const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // null = live row
}

/** Tenant column. Add to every tenant-scoped entity. */
export const orgColumn = {
  organizationId: uuid('organization_id').notNull(),
}

/** Money in integer cents. Never float, never string. */
export const centsColumn = (name: string) => integer(name).notNull().default(0)

// Re-export commonly used pgTable so call sites can import a single module.
export { pgTable, uuid, timestamp, integer }

/**
 * server/db/schema/program_memberships.ts — entity ⟷ program join
 * (Wave 1A / EH-A / ADR-0013).
 *
 * # Decisions (ADR-0008, ADR-0013)
 *   - A property/quote/work_order can belong to MULTIPLE programs at the
 *     same time. A homeowner might commission a Wildfire Retrofit AND a
 *     Roof Replacement on the same property; both programs share the
 *     site address but emit different inspection templates, quotes, and
 *     compliance artifacts. A flat membership table is the simplest
 *     model that captures the many-to-many without forcing every entity
 *     to grow a `programIds[]` JSONB column.
 *   - `entityType` is free-text (`property` | `quote` | `work_order`)
 *     rather than a pgEnum so adding new entity kinds (e.g. `invoice`,
 *     `lead`) is a code change, not a migration. Phase 1 mostly uses
 *     `property`; quote/WO memberships land in W2-2/W2-3.
 *   - Unique constraint on `(organizationId, programId, entityType,
 *     entityId)` prevents duplicate memberships. Index on
 *     `(organizationId, entityType, entityId)` makes "what programs is
 *     this property in?" a single index seek.
 *   - `assignedByUserId` is nullable because seed data is assigned by
 *     the system, not a person.
 *
 * # Decision cast down
 *   - Rejected: a polymorphic FK constraint (e.g. CHECK constraints per
 *     entityType). Postgres doesn't support polymorphic FKs cleanly; the
 *     service layer enforces referential integrity instead.
 *   - Rejected: storing membership inline as a JSONB array on each
 *     property/quote/WO. That works for read-one but kills "show me
 *     every property in the Wildfire program" — that query is on the
 *     happy path for the program admin screen and any reporting layer.
 */
import { pgTable, text, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { programs } from './programs'

export const programMemberships = pgTable(
  'program_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    programId: uuid('program_id').notNull().references(() => programs.id),
    /** Free-text discriminator: 'property' | 'quote' | 'work_order'. */
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assignedByUserId: uuid('assigned_by_user_id'),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    membershipUnique: uniqueIndex('program_memberships_unique').on(
      t.organizationId, t.programId, t.entityType, t.entityId,
    ),
    entityLookup: index('program_memberships_entity_idx').on(
      t.organizationId, t.entityType, t.entityId,
    ),
  }),
)

export type ProgramMembership = typeof programMemberships.$inferSelect
export type NewProgramMembership = typeof programMemberships.$inferInsert

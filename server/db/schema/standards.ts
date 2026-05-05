/**
 * server/db/schema/standards.ts — per-tenant compliance standards (E9-S3).
 *
 * One row per organization. Lists are stored as JSONB arrays of enum
 * values rather than join tables — the editor always full-replaces the
 * whole shape (per the contract decision) so a join table buys nothing.
 */
import { pgTable, uuid, jsonb, boolean, primaryKey } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { users } from './users'
import type {
  RoofMaterial,
  SidingMaterial,
  EaveType,
  VentType,
} from '../../../shared/contracts/assessment'

export const complianceStandards = pgTable(
  'compliance_standards',
  {
    // PK is just the orgId — exactly one standards row per tenant.
    ...orgColumn,
    compliantRoofMaterials: jsonb('compliant_roof_materials')
      .$type<RoofMaterial[]>()
      .notNull(),
    compliantSidingMaterials: jsonb('compliant_siding_materials')
      .$type<SidingMaterial[]>()
      .notNull(),
    compliantEaveTypes: jsonb('compliant_eave_types').$type<EaveType[]>().notNull(),
    compliantVentTypes: jsonb('compliant_vent_types').$type<VentType[]>().notNull(),
    requireDefensibleSpace: boolean('require_defensible_space').notNull().default(true),
    updatedById: uuid('updated_by_id').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({ pk: primaryKey({ columns: [t.organizationId] }) }),
)

export type ComplianceStandardsRow = typeof complianceStandards.$inferSelect

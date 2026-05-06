/**
 * server/db/schema/assessments.ts — assessment domain (E4 / E11-S6).
 *
 * Mirrors `shared/contracts/assessment.ts`. Material enums are postgres
 * enums so they round-trip through Drizzle without string-ification.
 */
import { pgTable, text, uuid, pgEnum, boolean, timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { properties } from './properties'
import { users } from './users'

export const roofMaterialEnum = pgEnum('roof_material', [
  'metal',
  'tile',
  'class_a_asphalt',
  'wood_shake',
  'standard_asphalt',
  'other',
])

export const sidingMaterialEnum = pgEnum('siding_material', [
  'fiber_cement',
  'stucco',
  'metal',
  'masonry',
  'brick',
  'wood',
  'vinyl',
  'other',
])

export const eaveTypeEnum = pgEnum('eave_type', ['enclosed', 'boxed', 'open', 'other'])

export const ventTypeEnum = pgEnum('vent_type', [
  'ember_resistant',
  'standard_mesh',
  'unscreened',
  'other',
])

export const assessments = pgTable('assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  assessedById: uuid('assessed_by_id').notNull().references(() => users.id),
  assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull(),
  roofMaterial: roofMaterialEnum('roof_material').notNull(),
  sidingMaterial: sidingMaterialEnum('siding_material').notNull(),
  eaveType: eaveTypeEnum('eave_type').notNull(),
  ventType: ventTypeEnum('vent_type').notNull(),
  defensibleSpaceCleared: boolean('defensible_space_cleared').notNull(),
  notes: text('notes'),
  ...auditColumns,
})

export type Assessment = typeof assessments.$inferSelect
export type NewAssessment = typeof assessments.$inferInsert

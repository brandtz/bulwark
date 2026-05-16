/**
 * server/db/schema/status_pipelines.ts — pipeline header + nodes
 * (Wave 1B / EH-H Part A / W1-3 / ADR-0023).
 *
 * # Tables
 *
 *   `status_pipelines`        — header row per (org, entityType, version)
 *   `status_pipeline_nodes`   — one row per node, FK to header
 *
 * # Decisions (ADR-0008, ADR-0023)
 *
 *   - `entityType` is plain `text` (Zod-bounded). Adding a new entity
 *     type (e.g. `dispatch`) shouldn't require a pgEnum migration.
 *   - `version` is a monotonically increasing integer per (org,
 *     entityType). Edits create a new pipeline row + nodes; previous
 *     active version is set to `isActive=false` in the same tx.
 *   - `allowedTransitions` is JSONB `string[]` (slugs). Reasoning in
 *     contract header — JOIN-free read path, atomic node write.
 *   - `(pipelineId, slug)` is unique inside a pipeline: pipelines own
 *     their slug namespace; the slug is the stable transition target.
 */
import { boolean, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const statusPipelines = pgTable(
  'status_pipelines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    entityType: text('entity_type').notNull(),
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({
    orgEntityVersionUnique: uniqueIndex('status_pipelines_org_entity_version_unique').on(
      t.organizationId,
      t.entityType,
      t.version,
    ),
  }),
)

export type StatusPipelineRow = typeof statusPipelines.$inferSelect
export type NewStatusPipelineRow = typeof statusPipelines.$inferInsert

export const statusPipelineNodes = pgTable(
  'status_pipeline_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pipelineId: uuid('pipeline_id').notNull(),
    slug: text('slug').notNull(),
    labelKey: text('label_key').notNull(),
    color: text('color').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isInitial: boolean('is_initial').notNull().default(false),
    isTerminal: boolean('is_terminal').notNull().default(false),
    allowedTransitions: jsonb('allowed_transitions').$type<string[]>().notNull().default([]),
    ...auditColumns,
  },
  (t) => ({
    pipelineSlugUnique: uniqueIndex('status_pipeline_nodes_pipeline_slug_unique').on(
      t.pipelineId,
      t.slug,
    ),
  }),
)

export type StatusPipelineNodeRow = typeof statusPipelineNodes.$inferSelect
export type NewStatusPipelineNodeRow = typeof statusPipelineNodes.$inferInsert

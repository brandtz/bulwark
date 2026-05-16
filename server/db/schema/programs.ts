/**
 * server/db/schema/programs.ts — GC programs (Wave 1A / EH-A / ADR-0013).
 *
 * # Decisions (ADR-0008, ADR-0013)
 *   - Bulwark is a GENERAL CONTRACTOR field-service platform. A "program"
 *     is the unit of work a GC ships — "Wildfire Retrofit", "Roof
 *     Replacement", "Kitchen Remodel", "Solar", etc. Each program owns
 *     its inspection template (W2-2), standard set (W2-2), compliance
 *     doc template (W2-2), default trade slots (W1-3), and pricing
 *     defaults (W1-3). Wildfire is ONE of N programs — not the platform.
 *   - The seeded Wildfire Retrofit program is marked `isBuiltin=true`:
 *     admins can deactivate it but cannot hard-delete it, because today's
 *     evaluator + standards are coded against its slug. New programs are
 *     admin-pluggable WITHOUT code changes (the goal of EH-A).
 *   - `kind` enum is `inspection_program | service_program`. Inspection
 *     programs (wildfire, hazard surveys) generate a compliance doc as
 *     their terminal artifact; service programs (roofing, kitchens) do
 *     not. Quote/WO/Invoice flows are identical across both kinds.
 *   - FKs to inspection_template / standard_set / compliance_doc_template
 *     are NULLABLE TODAY because those tables land in W2-2. The wiring
 *     hook is here so W2-2 can stamp them without another migration.
 *   - `(organizationId, slug)` is unique: different orgs can both have
 *     `wildfire-retrofit`, but a single org cannot have two programs at
 *     that slug.
 *
 * # Decision cast down
 *   - Rejected: a single global `programs` catalog with org-level
 *     "enable/disable" rows. That model couples Acme's program list to
 *     Bulwark Demo Co.'s — exactly the wrong shape for a multi-tenant
 *     GC platform where each org defines its own service mix.
 *   - Rejected: encoding pricing/trade defaults as separate tables.
 *     They're per-program configuration blobs that the admin edits as a
 *     unit; JSONB on the row is cheaper and avoids cross-table joins on
 *     every quote/WO scaffolding read.
 *   - Rejected: hard-deleting builtin programs. We soft-delete custom
 *     ones (deletedAt), but the builtin Wildfire program is the seed
 *     anchor for the existing evaluator + standards; deleting it would
 *     orphan every wildfire-bound property in the demo.
 */
import { pgTable, text, uuid, boolean, integer, jsonb, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const programKindEnum = pgEnum('program_kind', [
  'inspection_program',
  'service_program',
])

/** Per-program default trade slot. W1-3 (admin pipeline editor) feeds this. */
export type ProgramTradeDefault = {
  tradeSlug: string
  quantity: number
}

/** Per-program pricing defaults. UI shows under Programs → Defaults tab. */
export type ProgramPricingDefaults = {
  markupBps?: number
  taxBps?: number
  quoteExpiryDays?: number
}

export const programs = pgTable(
  'programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    kind: programKindEnum('kind').notNull(),
    description: text('description'),
    color: text('color'),
    icon: text('icon'),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    // Wired in W2-2 (inspection template engine) — nullable until then.
    inspectionTemplateId: uuid('inspection_template_id'),
    standardSetId: uuid('standard_set_id'),
    complianceDocTemplateId: uuid('compliance_doc_template_id'),

    defaultTradeSlots: jsonb('default_trade_slots').$type<ProgramTradeDefault[]>(),
    pricingDefaults: jsonb('pricing_defaults').$type<ProgramPricingDefaults>(),

    ...auditColumns,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('programs_org_slug_unique').on(t.organizationId, t.slug),
  }),
)

export type Program = typeof programs.$inferSelect
export type NewProgram = typeof programs.$inferInsert

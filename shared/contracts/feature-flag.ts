/**
 * shared/contracts/feature-flag.ts — runtime feature flags (W2-4 / ADR-0021).
 *
 * # Decisions (ADR-0008, ADR-0021)
 *   - Flags are DATA, not a const array (D-H2). The schema rule:
 *     `organizationId = null` rows are the GLOBAL DEFAULT (one per
 *     slug); `organizationId = <uuid>` rows are PER-TENANT OVERRIDES.
 *     `listForOrg` returns the merged view: defaults first, overrides
 *     win. The unit test pins this rule.
 *   - `value` is a string. Phase 1 flags are boolean-ish ("on"/"off")
 *     but downstream we want headroom for `"5"` (% rollout) or
 *     `'{"tiers":["pro"]}'`. Callers Zod-refine when needed.
 *   - `description` lives on the flag row, not in code — admins read it
 *     in the editor. Global defaults seed the description; an org
 *     override can overwrite copy too.
 *   - The page renders ONE row per known slug. "Known slugs" is the
 *     union of (a) global default rows + (b) anything an org override
 *     touched + (c) the static `KNOWN_FLAGS` list below so a fresh DB
 *     still surfaces actionable rows.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Flag rows.
// ----------------------------------------------------------------------------
export const FeatureFlagSchema = z
  .object({
    id: UuidSchema,
    /** null = global default row. */
    organizationId: UuidSchema.nullable(),
    slug: z.string().min(1).max(120),
    value: z.string().max(2000),
    description: z.string().max(1000).nullable(),
    updatedByUserId: UuidSchema.nullable(),
  })
  .merge(AuditFieldsSchema)
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>

/** A flat row in the org-merged view ready for the settings table. */
export const FeatureFlagMergedSchema = z.object({
  slug: z.string().min(1).max(120),
  value: z.string().max(2000),
  description: z.string().max(1000).nullable(),
  hasOverride: z.boolean(),
  defaultValue: z.string().nullable(),
})
export type FeatureFlagMerged = z.infer<typeof FeatureFlagMergedSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const FeatureFlagSetInputSchema = z.object({
  /** null = upsert the global default row (super_admin only at page layer). */
  organizationId: UuidSchema.nullable(),
  slug: z.string().min(1).max(120),
  value: z.string().max(2000),
  description: z.string().max(1000).nullable().optional(),
  updatedByUserId: UuidSchema.nullable(),
})
export type FeatureFlagSetInput = z.infer<typeof FeatureFlagSetInputSchema>

// ----------------------------------------------------------------------------
// Known slug seed (kept here so a fresh DB still renders rows + the merged
// `listForOrg` always returns at least these slugs).
// ----------------------------------------------------------------------------
export interface KnownFlagSeed {
  slug: string
  defaultValue: string
  description: string
}
export const KNOWN_FLAGS: KnownFlagSeed[] = [
  { slug: 'compliance.async-jobs', defaultValue: 'on', description: 'Use the async-job pipeline for compliance PDF generation.' },
  { slug: 'invoices.overdue-derived', defaultValue: 'on', description: 'Compute the "overdue" view client-side (vs. persisted column).' },
  { slug: 'field.offline-queue', defaultValue: 'off', description: 'Enable the field-side offline queue (placeholder until PWA work).' },
  { slug: 'webhooks.delivery-enabled', defaultValue: 'on', description: 'Master switch for outbound webhook delivery.' },
  { slug: 'notifications.email-enabled', defaultValue: 'off', description: 'Send email notifications (requires resend provider config).' },
  { slug: 'notifications.sms-enabled', defaultValue: 'off', description: 'Send SMS notifications (requires twilio provider config).' },
]

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IFeatureFlagService {
  list(): Promise<{ rows: FeatureFlag[] }>
  /** Returns the override row OR null if only the default applies. */
  get(organizationId: string | null, slug: string): Promise<FeatureFlag | null>
  set(input: FeatureFlagSetInput): Promise<FeatureFlag>
  /** Merged view: defaults + KNOWN_FLAGS + org overrides. */
  listForOrg(organizationId: string): Promise<{ rows: FeatureFlagMerged[] }>
}

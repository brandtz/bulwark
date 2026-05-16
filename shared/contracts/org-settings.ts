/**
 * shared/contracts/org-settings.ts — per-tenant numbering rules + defaults
 * (Wave 1B / EH-H Part A / W1-3).
 *
 * # Why this contract exists
 *
 * Today the quote/WO/invoice number generators in `*.real.ts` hardcode
 * the format strings (`Q-${year}-${seq:04}`, etc.) and the defaults for
 * markup/tax/expiry/SLA hide inside per-page constants. Directive D-H2
 * requires every such default to be admin-editable per tenant.
 *
 * `org_settings` is the singleton config row per organization that
 * stores:
 *   - Numbering formats for Quote, Work Order, Invoice
 *   - Default markup / tax (basis points)
 *   - Default quote expiry / invoice terms (days)
 *   - Default SLA days for assessment + quote turnaround
 *
 * The number generators consume `quoteNumberFormat` etc. through the
 * `shared/utils/numbering.ts#formatSequentialNumber` helper. Pricing
 * defaults are read by the quote builder + invoice creator on first
 * paint (Wave 2 work fleshes this in fully; v1 plumbs the values).
 *
 * # Decisions captured (ADR-0008)
 *
 *   - One row per org (singleton). Same shape as `org_branding`.
 *   - Basis-points for percentages (1500 = 15.00%) — matches the
 *     existing `ProgramPricingDefaults` shape and avoids float-equality
 *     surprises in tests.
 *   - The format string is a tiny mini-template: `{year}`, `{seq}`,
 *     `{seq:NN}` (pad to NN width). Documented in `numbering.ts`.
 *
 * # Decision cast down
 *
 *   - Rejected: storing numbering formats as a JSONB blob. The three
 *     fields are typed scalars; an opaque blob loses Zod refinement.
 *   - Rejected: separate `org_pricing` + `org_sla` tables. Two more
 *     rows to join for a singleton-per-org with <10 columns each. One
 *     row, one read.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const NUMBERING_FORMAT_HINT =
  'Tokens: {year}, {seq}, {seq:NN}. Example: Q-{year}-{seq:04} → Q-2026-0001.'

const NumberingFormatSchema = z
  .string()
  .min(1, 'Required')
  .max(40)
  .refine((s) => s.includes('{seq'), {
    message: 'Format must include a {seq} or {seq:NN} token',
  })

export const OrgSettingsSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    quoteNumberFormat: NumberingFormatSchema,
    woNumberFormat: NumberingFormatSchema,
    invoiceNumberFormat: NumberingFormatSchema,
    defaultMarkupBps: z.number().int().min(0).max(100_000),
    defaultTaxBps: z.number().int().min(0).max(100_000),
    defaultQuoteExpiryDays: z.number().int().positive().max(365),
    defaultInvoiceTermsDays: z.number().int().positive().max(365),
    defaultSlaDaysAssessment: z.number().int().positive().max(365),
    defaultSlaDaysQuote: z.number().int().positive().max(365),
  })
  .merge(AuditFieldsSchema)
export type OrgSettings = z.infer<typeof OrgSettingsSchema>

export const OrgSettingsUpdateInputSchema = z.object({
  organizationId: UuidSchema,
  quoteNumberFormat: NumberingFormatSchema.optional(),
  woNumberFormat: NumberingFormatSchema.optional(),
  invoiceNumberFormat: NumberingFormatSchema.optional(),
  defaultMarkupBps: z.number().int().min(0).max(100_000).optional(),
  defaultTaxBps: z.number().int().min(0).max(100_000).optional(),
  defaultQuoteExpiryDays: z.number().int().positive().max(365).optional(),
  defaultInvoiceTermsDays: z.number().int().positive().max(365).optional(),
  defaultSlaDaysAssessment: z.number().int().positive().max(365).optional(),
  defaultSlaDaysQuote: z.number().int().positive().max(365).optional(),
})
export type OrgSettingsUpdateInput = z.infer<typeof OrgSettingsUpdateInputSchema>

export const ORG_SETTINGS_DEFAULTS = {
  quoteNumberFormat: 'Q-{year}-{seq:04}',
  woNumberFormat: 'WO-{year}-{seq:04}',
  invoiceNumberFormat: 'INV-{year}-{seq:04}',
  defaultMarkupBps: 1500,
  defaultTaxBps: 0,
  defaultQuoteExpiryDays: 30,
  defaultInvoiceTermsDays: 30,
  defaultSlaDaysAssessment: 7,
  defaultSlaDaysQuote: 3,
} as const

export interface IOrgSettingsService {
  /** Synthesises a defaults row if none exists (matches the branding pattern). */
  get(organizationId: string): Promise<OrgSettings>
  update(input: OrgSettingsUpdateInput): Promise<OrgSettings>
}

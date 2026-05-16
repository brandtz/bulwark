/**
 * server/db/schema/org_settings.ts — singleton per-tenant settings row
 * (Wave 1B / EH-H Part A / W1-3).
 *
 * See `shared/contracts/org-settings.ts` for the why. One row per org,
 * synthesised on first read via `IOrgSettingsService.get` if missing
 * (matches the branding pattern from W1-2).
 */
import { integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const orgSettings = pgTable(
  'org_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    quoteNumberFormat: text('quote_number_format').notNull().default('Q-{year}-{seq:04}'),
    woNumberFormat: text('wo_number_format').notNull().default('WO-{year}-{seq:04}'),
    invoiceNumberFormat: text('invoice_number_format').notNull().default('INV-{year}-{seq:04}'),
    defaultMarkupBps: integer('default_markup_bps').notNull().default(1500),
    defaultTaxBps: integer('default_tax_bps').notNull().default(0),
    defaultQuoteExpiryDays: integer('default_quote_expiry_days').notNull().default(30),
    defaultInvoiceTermsDays: integer('default_invoice_terms_days').notNull().default(30),
    defaultSlaDaysAssessment: integer('default_sla_days_assessment').notNull().default(7),
    defaultSlaDaysQuote: integer('default_sla_days_quote').notNull().default(3),
    ...auditColumns,
  },
  (t) => ({
    orgUnique: uniqueIndex('org_settings_org_unique').on(t.organizationId),
  }),
)

export type OrgSettingsRow = typeof orgSettings.$inferSelect
export type NewOrgSettingsRow = typeof orgSettings.$inferInsert

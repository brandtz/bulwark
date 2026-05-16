/**
 * server/db/schema/org_branding.ts — per-tenant branding singleton (EH-B / W1-2).
 *
 * What this file does:
 *   - One row per organization holding the tenant's brand surface: logo
 *     URL, primary/accent colors, footer text on PDFs, support contact,
 *     license footer copy (e.g. "OR CCB# 123456"), timezone, currency,
 *     date format.
 *   - Read by `useService('label').getBranding()`; written by
 *     `/settings/branding`.
 *
 * Decisions captured here (ADR-0008, ADR-0014):
 *   - Singleton row per org — `organizationId` is a unique key. We use the
 *     same INSERT ... ON CONFLICT DO UPDATE pattern the standards row uses
 *     (one row per tenant, not many).
 *   - Color stored as hex string (e.g. `#1E3A8A`) — easy for the picker
 *     and the PDF renderer; no need for HSL math at the DB layer.
 *   - No soft-delete column (intentional override of the per-CONVENTIONS
 *     default for entity tables). Branding is a configuration row; admins
 *     "delete" by reverting fields. `auditColumns` are still included so
 *     `createdAt` / `updatedAt` work — but `deletedAt` is unused.
 *
 * Decisions NOT taken:
 *   - We considered storing the logo as a `bytea` blob. Rejected — R2
 *     handles binary; the row stores the public URL. R2 upload helper
 *     lands in a follow-up (see handoff note); Phase 1 accepts a URL.
 *   - We considered breaking timezone/currency/dateFormat into a separate
 *     `org_locale` table. Rejected — three columns is not a table.
 *
 * Maintenance notes:
 *   - When adding a new branding field, also extend `BrandingSchema` in
 *     `shared/contracts/label.ts` and the `/settings/branding` editor.
 */
import { pgTable, text, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const orgBranding = pgTable(
  'org_branding',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    logoUrl: text('logo_url'),
    primaryColor: text('primary_color').notNull().default('#1E3A8A'),
    accentColor: text('accent_color').notNull().default('#FF6B35'),
    footerText: text('footer_text'),
    supportEmail: text('support_email'),
    supportPhone: text('support_phone'),
    licenseLabel: text('license_label'),
    timezone: text('timezone').notNull().default('America/Los_Angeles'),
    currencyCode: text('currency_code').notNull().default('USD'),
    dateFormat: text('date_format').notNull().default('MM/dd/yyyy'),
    ...auditColumns,
  },
  (t) => ({
    uniqByOrg: uniqueIndex('org_branding_org_uq').on(t.organizationId),
  }),
)

export type OrgBrandingRow = typeof orgBranding.$inferSelect
export type NewOrgBrandingRow = typeof orgBranding.$inferInsert

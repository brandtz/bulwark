/**
 * shared/contracts/label.ts — CMS label registry + per-tenant branding (EH-B / W1-2).
 *
 * What this file does:
 *   - Encodes the Zod shape of the per-tenant label override row, the
 *     namespace whitelist, the branding singleton row, and the
 *     `ILabelService` interface that the mock + real backends implement.
 *
 * Decisions captured here (ADR-0008, ADR-0014):
 *   - **`(namespace, key)` composite identity, not flat dotted strings.**
 *     The editor groups rows by namespace tab and bulkUpsert pushes a
 *     batch within a single namespace; parsing dotted strings everywhere
 *     would be lossy and error-prone.
 *   - **Locale ships in v1 even though Phase 1 is en-US only.** Retro-
 *     fitting locale onto an already-populated label table is a
 *     destructive migration; we eat the column cost now. Default
 *     `'en-US'`. Future Spanish/Hmong overrides land without a schema
 *     change.
 *   - **Defaults live in code (`shared/labels/defaults.ts`).** The DB
 *     stores ONLY overrides. `getMap()` returns the override map; the
 *     composable merges with `DEFAULT_LABELS` so a stale DB seed cannot
 *     drift from a code refactor of the default copy.
 *   - **Branding is one row per org.** Distinct from `labels` because
 *     its fields are typed (color, URL, timezone) — encoding it as
 *     N opaque label rows would lose Zod refinement on each field.
 *
 * Decisions NOT taken:
 *   - We considered making `LabelNamespaceSchema` a Postgres enum.
 *     Rejected — namespaces grow per epic (Wave 2 adds `dispatch.*`,
 *     Wave 3 adds `report.*`); an enum at the DB layer would force a
 *     migration per addition. The Zod enum is the boundary; DB stores
 *     `text`.
 *   - We considered storing branding columns as JSONB to allow open
 *     extension. Rejected — admins want a typed editor (`primaryColor`
 *     is a hex picker, not an `unknown`).
 *
 * Maintenance notes:
 *   - When a new namespace is added (e.g. `dispatch.priority`), extend
 *     `LabelNamespaceSchema` AND `DEFAULT_LABELS`. The unit test
 *     `tests/unit/labels.test.ts` asserts every default key is namespaced
 *     against this enum — adding one without the other fails the test.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Namespace whitelist. Mirrors §2 Pivot P2 of PHASE1_HARDENING_PLAN.md.
// Lint test in tests/unit/labels.test.ts enforces every DEFAULT_LABELS key
// is `<namespace>.<rest>` where <namespace> ∈ this enum.
// ----------------------------------------------------------------------------
export const LabelNamespaceSchema = z.enum([
  'status.property',
  'status.quote',
  'status.work_order',
  'status.invoice',
  'status.compliance',
  'status.job',
  'trade',
  'role',
  'program',
  'email.subject',
  'email.body',
  'sms.body',
  'pdf.footer',
  'pdf.declaration',
  'cta',
  // W2-3b / EH-G — quote/wo/invoice depth UI labels (ADR-0020).
  'quote.tiers',
  'quote.reject-reasons',
  'work-order.priority',
  'invoice.terms',
  'invoice-payment.methods',
  // W2-1 / EH-E — property depth tab names + taxonomies (ADR-0018).
  'property.tabs',
  'building.kinds',
  'contact.kinds',
  'attachment.kinds',
  // W3-1 / EH-J — in-app notification chrome (ADR-0027).
  'notification',
  // W3-3 / EH-M — field / mobile / PWA (ADR-0029).
  'field',
  'field.tabs',
  'field.check-in',
  'field.install',
  // W3-2 / EH-K — reporting + dashboards (ADR-0030).
  'reports.titles',
  'dashboard',
  'dashboard.kpis',
  'dashboard.range',
  // W3-4 / EH-N + EH-O — sub & homeowner portals (ADR-0031/0032).
  'sub.tabs',
  'sub.coi',
  'sub.quote',
  'homeowner.tabs',
  'homeowner.quote',
  'homeowner.invoice',
  'homeowner.empty',
  // W4-1 / EH-P + EH-I — search palette, saved views, MFA, login,
  // permissions matrix (presentation-only follow-up to W2-5 / W3-5).
  'search',
  'saved-views',
  'mfa.setup',
  'mfa.disable',
  'login.locked',
  'login.mfa',
  'permissions.matrix',
  'permissions.matrix.state',
  // W5-4 / EH-S — privacy + ToS + DPA + account-data pages (ADR-0038).
  'legal.privacy',
  'legal.terms',
  'legal.dpa',
  'legal.account',
])
export type LabelNamespace = z.infer<typeof LabelNamespaceSchema>

export const DEFAULT_LOCALE = 'en-US'

// ----------------------------------------------------------------------------
// Label row. Shape mirrors `server/db/schema/labels.ts`.
// ----------------------------------------------------------------------------
export const LabelSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    namespace: LabelNamespaceSchema,
    key: z.string().min(1).max(120),
    locale: z.string().min(2).max(16),
    value: z.string().min(1).max(1000),
    description: z.string().max(500).nullable(),
  })
  .merge(AuditFieldsSchema)
export type Label = z.infer<typeof LabelSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const LabelUpsertInputSchema = z.object({
  organizationId: UuidSchema,
  namespace: LabelNamespaceSchema,
  key: z.string().min(1).max(120),
  locale: z.string().min(2).max(16).default(DEFAULT_LOCALE),
  value: z.string().min(1).max(1000),
  description: z.string().max(500).nullable().optional(),
})
export type LabelUpsertInput = z.infer<typeof LabelUpsertInputSchema>

export const LabelListInputSchema = z.object({
  organizationId: UuidSchema,
  namespace: LabelNamespaceSchema.optional(),
  locale: z.string().min(2).max(16).default(DEFAULT_LOCALE),
})
export type LabelListInput = z.infer<typeof LabelListInputSchema>

export const LabelBulkUpsertInputSchema = z.object({
  organizationId: UuidSchema,
  locale: z.string().min(2).max(16).default(DEFAULT_LOCALE),
  entries: z
    .array(
      z.object({
        namespace: LabelNamespaceSchema,
        key: z.string().min(1).max(120),
        value: z.string().min(1).max(1000),
        description: z.string().max(500).nullable().optional(),
      }),
    )
    .max(500),
})
export type LabelBulkUpsertInput = z.infer<typeof LabelBulkUpsertInputSchema>

// ----------------------------------------------------------------------------
// Outputs.
// ----------------------------------------------------------------------------
export const LabelListOutputSchema = z.object({
  rows: z.array(LabelSchema),
})
export type LabelListOutput = z.infer<typeof LabelListOutputSchema>

/**
 * Flat map of `${namespace}.${key}` → override value. The shape the
 * composable hydrates into a `useState` cache and reads from on every
 * `t()` call.
 */
export const LabelMapOutputSchema = z.record(z.string())
export type LabelMapOutput = z.infer<typeof LabelMapOutputSchema>

// ----------------------------------------------------------------------------
// Branding singleton.
// ----------------------------------------------------------------------------
const HexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u, 'Expected hex color like #1E3A8A')

export const BrandingSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    logoUrl: z.string().url().nullable(),
    primaryColor: HexColor,
    accentColor: HexColor,
    footerText: z.string().max(1000).nullable(),
    supportEmail: z.string().email().nullable(),
    supportPhone: z.string().max(40).nullable(),
    licenseLabel: z.string().max(120).nullable(),
    timezone: z.string().min(1).max(60),
    currencyCode: z.string().length(3),
    dateFormat: z.string().min(1).max(40),
  })
  .merge(AuditFieldsSchema)
export type Branding = z.infer<typeof BrandingSchema>

export const BrandingUpdateInputSchema = z.object({
  organizationId: UuidSchema,
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: HexColor.optional(),
  accentColor: HexColor.optional(),
  footerText: z.string().max(1000).nullable().optional(),
  supportEmail: z.string().email().nullable().optional(),
  supportPhone: z.string().max(40).nullable().optional(),
  licenseLabel: z.string().max(120).nullable().optional(),
  timezone: z.string().min(1).max(60).optional(),
  currencyCode: z.string().length(3).optional(),
  dateFormat: z.string().min(1).max(40).optional(),
})
export type BrandingUpdateInput = z.infer<typeof BrandingUpdateInputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface ILabelService {
  list(input: LabelListInput): Promise<LabelListOutput>
  /**
   * Flat override map for the resolved tenant. Returns ONLY overrides;
   * the composable merges with `DEFAULT_LABELS` from code.
   */
  getMap(organizationId: string, locale?: string): Promise<LabelMapOutput>
  upsert(input: LabelUpsertInput): Promise<Label>
  bulkUpsert(input: LabelBulkUpsertInput): Promise<LabelListOutput>
  delete(id: string, organizationId: string): Promise<void>
  getBranding(organizationId: string): Promise<Branding>
  updateBranding(input: BrandingUpdateInput): Promise<Branding>
}

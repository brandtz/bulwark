/**
 * shared/labels/defaults.ts — code-defined default copy for the CMS label
 * registry (EH-B / W1-2 / ADR-0014).
 *
 * What this file does:
 *   - Exports `DEFAULT_LABELS`: a flat `Record<string, string>` keyed by
 *     `${namespace}.${key}` (e.g. `status.property.lead` → `"Lead"`).
 *   - This is the source of truth for default user-facing copy. The
 *     `labels` DB table stores ONLY overrides; `useLabel().t(ns, key, fb)`
 *     merges the per-tenant override map on top of these defaults at
 *     read time.
 *
 * Decisions captured here (ADR-0008, ADR-0014):
 *   - **Code defaults, DB overrides.** Seeding every default into the DB
 *     at install would couple code refactors to migrations. With code
 *     defaults, "rename a status" is a one-line change and admins who
 *     overrode the prior copy keep their override.
 *   - **Exhaustive coverage of every status enum value.** The unit test
 *     `tests/unit/labels.test.ts` proves this: adding a new
 *     `PropertyStatus` (etc.) and forgetting to add a default here fails
 *     the test. This is the failure mode we WANT.
 *   - **Trades + roles + program seed inline** so the editor's first
 *     paint has rows for every key admins can override. We don't
 *     auto-discover roles/trades; this file IS the discovery surface.
 *
 * Decisions NOT taken:
 *   - We considered generating this from the Zod enums at build time.
 *     Rejected — defaults are human-readable display copy, not a
 *     mechanical title-case of the enum value (`"In progress"` not
 *     `"In_progress"`). Hand-written stays correct.
 *   - We considered making this a `Map<LabelNamespace, Map<string, string>>`
 *     and flattening at read time. Rejected — every read path wants the
 *     flat shape; the nested form would force the same flattening at
 *     every call site.
 *
 * Maintenance notes:
 *   - When you add a status to `PropertyStatusSchema` / `QuoteStatusSchema`
 *     / etc., also add `status.<domain>.<value>` here. The labels test
 *     enforces this.
 *   - When you seed a new program, add `program.<slug>` here.
 */
import type { PropertyStatus } from '../contracts/property'
import type { QuoteStatus, QuoteTier, QuoteRejectedReasonCode } from '../contracts/quote'
import type { WorkOrderStatus, TradeSlotStatus, WorkOrderPriority } from '../contracts/work-order'
import type { InvoiceStatus, InvoiceTerms } from '../contracts/invoice'
import type { InvoicePaymentMethod } from '../contracts/invoice-payment'
import type { ComplianceDocStatus } from '../contracts/compliance'
import type { JobStatus } from '../contracts/job'
import type { Trade } from '../contracts/subcontractor'
import type { Role } from '../contracts/_shared'

// ----------------------------------------------------------------------------
// Per-domain default-label dictionaries. Each `Record<Enum, string>` is
// exhaustive — TypeScript will fail compile if a new enum value is added
// without a default here.
// ----------------------------------------------------------------------------

const PROPERTY_STATUS_DEFAULTS: Record<PropertyStatus, string> = {
  lead: 'Lead',
  scheduled: 'Scheduled',
  assessed: 'Assessed',
  quoted: 'Quoted',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  compliance_pending: 'Compliance pending',
  compliance_complete: 'Compliance complete',
  invoiced: 'Invoiced',
  paid: 'Paid',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
}

const QUOTE_STATUS_DEFAULTS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
}

const WORK_ORDER_STATUS_DEFAULTS: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// Trade slot statuses share the `status.work_order.slot.<value>` family
// so admins can rename them separately from the envelope status.
const TRADE_SLOT_STATUS_DEFAULTS: Record<TradeSlotStatus, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
}

const INVOICE_STATUS_DEFAULTS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partial',
  paid: 'Paid',
  voided: 'Voided',
}
// `overdue` is a derived view, not a persisted status, but it's a
// user-visible label so we include it.
const INVOICE_VIEW_EXTRA: Record<string, string> = { overdue: 'Overdue' }

const COMPLIANCE_STATUS_DEFAULTS: Record<ComplianceDocStatus, string> = {
  draft: 'Draft',
  generating: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const JOB_STATUS_DEFAULTS: Record<JobStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
}

const TRADE_DEFAULTS: Record<Trade, string> = {
  roofing: 'Roofing',
  siding: 'Siding',
  gutters: 'Gutters',
  eaves_vents: 'Eaves & vents',
  defensible_space: 'Defensible space',
  general_labor: 'General labor',
}

const ROLE_DEFAULTS: Record<Role, string> = {
  super_admin: 'Super admin',
  org_admin: 'Org admin',
  org_manager: 'Org manager',
  field: 'Field crew',
  sub_contractor: 'Subcontractor',
  homeowner: 'Homeowner',
  viewer: 'Viewer',
}

// Programs ship with one inaugural seed; W1-1 owns the program model.
// Reference here uses the slug that W1-1's seed publishes.
const PROGRAM_DEFAULTS: Record<string, string> = {
  'wildfire-retrofit': 'Wildfire Retrofit',
}

// W2-3b / EH-G — quote/wo/invoice depth UI labels (ADR-0020).
// All enum-derived copy is funneled through `useLabel().t(...)` per the
// CMS-label rule (ADR-0014). These dictionaries are exhaustive so a new
// enum value forces a default here at compile time.
const QUOTE_TIER_DEFAULTS: Record<QuoteTier, string> = {
  good: 'Good',
  better: 'Better',
  best: 'Best',
  custom: 'Custom',
}

const QUOTE_REJECT_REASON_DEFAULTS: Record<QuoteRejectedReasonCode, string> = {
  price: 'Price',
  scope: 'Scope',
  timing: 'Timing',
  competitor: 'Went with competitor',
  unresponsive: 'Customer unresponsive',
  other: 'Other',
}

const WORK_ORDER_PRIORITY_DEFAULTS: Record<WorkOrderPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

const INVOICE_TERMS_DEFAULTS: Record<InvoiceTerms, string> = {
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_60: 'Net 60',
  custom: 'Custom',
}

const INVOICE_PAYMENT_METHOD_DEFAULTS: Record<InvoicePaymentMethod, string> = {
  check: 'Check',
  ach: 'ACH',
  card: 'Card',
  cash: 'Cash',
  wire: 'Wire',
  other: 'Other',
}

// PDF + email defaults. Small surface; expand in Wave 2.
const PDF_DEFAULTS: Record<string, string> = {
  'footer.default':
    'Generated by Bulwark. For questions, contact your contractor.',
  'declaration.default':
    'I certify that the work described herein was completed in accordance with the applicable standards.',
}
const EMAIL_DEFAULTS: Record<string, string> = {
  'subject.quote_sent': 'Your quote from {{org}}',
  'subject.invoice_sent': 'Invoice {{number}} from {{org}}',
  'subject.compliance_ready': 'Your compliance document is ready',
}

// W2-1 / EH-E — property depth tabs + taxonomies (ADR-0018).
const PROPERTY_TABS_DEFAULTS: Record<string, string> = {
  overview: 'Overview',
  buildings: 'Buildings',
  contacts: 'Contacts',
  photos: 'Photos',
  attachments: 'Attachments',
}
const BUILDING_KINDS_DEFAULTS: Record<string, string> = {
  house: 'House',
  adu: 'ADU',
  garage: 'Garage',
  barn: 'Barn',
  shop: 'Shop',
  other: 'Other',
}
const CONTACT_KINDS_DEFAULTS: Record<string, string> = {
  owner: 'Owner',
  tenant: 'Tenant',
  property_manager: 'Property manager',
  hoa: 'HOA',
  emergency: 'Emergency',
  insurance: 'Insurance',
  vendor: 'Vendor',
  other: 'Other',
}
const ATTACHMENT_KINDS_DEFAULTS: Record<string, string> = {
  survey: 'Survey',
  plat: 'Plat',
  insurance: 'Insurance',
  permit: 'Permit',
  other: 'Other',
}

// W3-1 / EH-J — in-app notifications: severity chips + empty states (ADR-0027).
const NOTIFICATION_DEFAULTS: Record<string, string> = {
  'severity.info': 'Info',
  'severity.success': 'Success',
  'severity.warning': 'Warning',
  'severity.error': 'Error',
  'bell.empty': 'All caught up.',
  'feed.title': 'Notifications',
}

// W3-2 / EH-K — reports landing + dashboard chrome (ADR-0030). KPI card
// labels, report titles, the date-range picker buttons, and the empty
// state copy all live here so the CMS-label editor surfaces them.
const REPORTS_TITLE_DEFAULTS: Record<string, string> = {
  revenue: 'Revenue by month',
  subcontractor: 'Subcontractor performance',
  'inspection-pass': 'Inspection pass rate by program',
  'ar-aging': 'AR aging detail',
  'top-properties': 'Top properties',
}
const DASHBOARD_KPI_DEFAULTS: Record<string, string> = {
  'open-quotes': 'Open quotes',
  'open-quotes-value': 'Open quote value',
  'accepted-quotes-value': 'Accepted quote value',
  'scheduled-wos': 'Scheduled work orders',
  'overdue-invoices': 'Overdue invoices',
  'overdue-invoices-value': 'Overdue balance',
  'paid-this-month': 'Paid this month',
  'compliance-this-month': 'Compliance docs this month',
  'open-compliance-issues': 'Open compliance issues',
}
const DASHBOARD_RANGE_DEFAULTS: Record<string, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  custom: 'Custom',
}
const DASHBOARD_MISC_DEFAULTS: Record<string, string> = {
  empty: 'No data in this range yet.',
}

// W3-3 / EH-M (ADR-0029) — field / mobile / PWA surface.
const FIELD_TABS_DEFAULTS: Record<string, string> = {
  'my-day': 'My Day',
  inspect: 'Inspect',
  photos: 'Photos',
  notes: 'Notes',
}
const FIELD_CHECK_IN_DEFAULTS: Record<string, string> = {
  in: 'Check in',
  out: 'Check out',
}
const FIELD_INSTALL_DEFAULTS: Record<string, string> = {
  title: 'Install Bulwark Field',
  cta: 'Install',
}
const FIELD_MISC_DEFAULTS: Record<string, string> = {
  'empty-day': 'Nothing scheduled today.',
}

// W3-4 / EH-N + EH-O — sub & homeowner portal copy (ADR-0031/0032).
const SUB_TABS_DEFAULTS: Record<string, string> = {
  wos: 'My WOs',
  quotes: 'My Quotes',
  cois: 'My COIs',
  settings: 'Settings',
}
const SUB_COI_DEFAULTS: Record<string, string> = {
  expiring: 'Expiring soon',
  expired: 'Expired',
  active: 'Active',
}
const SUB_QUOTE_DEFAULTS: Record<string, string> = {
  accept: 'Accept',
  decline: 'Decline',
}
const HOMEOWNER_TABS_DEFAULTS: Record<string, string> = {
  home: 'Home',
  properties: 'Properties',
  quotes: 'Quotes',
  invoices: 'Invoices',
}
const HOMEOWNER_QUOTE_DEFAULTS: Record<string, string> = {
  view: 'View',
  accept: 'Accept',
  reject: 'Reject',
}
const HOMEOWNER_EMPTY_DEFAULTS: Record<string, string> = {
  quotes: 'No quotes yet.',
  invoices: 'No invoices yet.',
  inspections: 'No inspections yet.',
}

// W4-1 / EH-P — search palette copy (ADR-0033).
const SEARCH_DEFAULTS: Record<string, string> = {
  placeholder: 'Search… ⌘K',
  empty: 'No results. Try a different search.',
  loading: 'Searching…',
}

// W4-1 / EH-P — saved-views menu copy (ADR-0033).
const SAVED_VIEWS_DEFAULTS: Record<string, string> = {
  title: 'Views',
  save: 'Save current view…',
  manage: 'Manage views…',
  'shared-badge': 'Shared',
  'default-badge': 'Default',
}

// W4-1 / EH-I — MFA setup copy (ADR-0024).
const MFA_SETUP_DEFAULTS: Record<string, string> = {
  title: 'Two-factor authentication',
  scan: 'Scan this QR code with your authenticator app.',
  confirm: 'Enter the 6-digit code to confirm enrolment.',
  'backup-codes-header': 'Save these backup codes',
  'copy-all': 'Copy all',
  download: 'Download as .txt',
}
const MFA_DISABLE_DEFAULTS: Record<string, string> = {
  confirm: 'Enter your current 6-digit code (or a backup code) to disable.',
}

// W4-1 / EH-D — login lockout + MFA branches (ADR-0023, ADR-0024).
const LOGIN_LOCKED_DEFAULTS: Record<string, string> = {
  title: 'Account temporarily locked',
  subtitle: 'Try again in {retryAfter}.',
}
const LOGIN_MFA_DEFAULTS: Record<string, string> = {
  title: 'Enter your authentication code',
  'use-backup': 'Use a backup code',
}

// W4-1 / EH-I — permissions matrix copy (ADR-0025).
const PERMISSIONS_MATRIX_DEFAULTS: Record<string, string> = {
  title: 'Permissions',
  reset: 'Reset to defaults',
}
const PERMISSIONS_MATRIX_STATE_DEFAULTS: Record<string, string> = {
  default: 'Default',
  granted: 'Allow',
  denied: 'Deny',
}

// W4-1 — homeowner invoice extras (download-pdf).
const HOMEOWNER_INVOICE_DEFAULTS: Record<string, string> = {
  'download-pdf': 'Download PDF',
}

// W5-4 (ADR-0038) — legal pages + DSR profile/data surface labels.
// Phase 1 keeps copy inline in the page templates; these labels cover
// the chrome (footer link copy, page titles, button labels) that the
// CMS-label editor needs to surface.
const LEGAL_PRIVACY_DEFAULTS: Record<string, string> = {
  title: 'Privacy Policy',
  'footer-link': 'Privacy',
}
const LEGAL_TERMS_DEFAULTS: Record<string, string> = {
  title: 'Terms of Service',
  'footer-link': 'Terms',
}
const LEGAL_DPA_DEFAULTS: Record<string, string> = {
  title: 'Data Processing Addendum',
  'footer-link': 'DPA',
}
const LEGAL_ACCOUNT_DEFAULTS: Record<string, string> = {
  'data-title': 'Account & data',
  'export-button': 'Download my data',
  'delete-button': 'Request deletion…',
  'confirm-button': 'Confirm deletion',
}

// ----------------------------------------------------------------------------
// Flatten into the wire shape the composable reads.
// ----------------------------------------------------------------------------
function namespaced(prefix: string, dict: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(dict)) out[`${prefix}.${k}`] = v
  return out
}

export const DEFAULT_LABELS: Record<string, string> = {
  ...namespaced('status.property', PROPERTY_STATUS_DEFAULTS),
  ...namespaced('status.quote', QUOTE_STATUS_DEFAULTS),
  ...namespaced('status.work_order', WORK_ORDER_STATUS_DEFAULTS),
  ...namespaced('status.work_order.slot', TRADE_SLOT_STATUS_DEFAULTS),
  ...namespaced('status.invoice', { ...INVOICE_STATUS_DEFAULTS, ...INVOICE_VIEW_EXTRA }),
  ...namespaced('status.compliance', COMPLIANCE_STATUS_DEFAULTS),
  ...namespaced('status.job', JOB_STATUS_DEFAULTS),
  ...namespaced('trade', TRADE_DEFAULTS),
  ...namespaced('role', ROLE_DEFAULTS),
  ...namespaced('program', PROGRAM_DEFAULTS),
  // W2-3b / EH-G — quote/wo/invoice depth UI namespaces.
  ...namespaced('quote.tiers', QUOTE_TIER_DEFAULTS),
  ...namespaced('quote.reject-reasons', QUOTE_REJECT_REASON_DEFAULTS),
  ...namespaced('work-order.priority', WORK_ORDER_PRIORITY_DEFAULTS),
  ...namespaced('invoice.terms', INVOICE_TERMS_DEFAULTS),
  ...namespaced('invoice-payment.methods', INVOICE_PAYMENT_METHOD_DEFAULTS),
  ...namespaced('pdf.footer', { default: PDF_DEFAULTS['footer.default']! }),
  ...namespaced('pdf.declaration', {
    default: PDF_DEFAULTS['declaration.default']!,
  }),
  ...namespaced('email.subject', {
    quote_sent: EMAIL_DEFAULTS['subject.quote_sent']!,
    invoice_sent: EMAIL_DEFAULTS['subject.invoice_sent']!,
    compliance_ready: EMAIL_DEFAULTS['subject.compliance_ready']!,
  }),
  // W2-1 / EH-E — property depth (ADR-0018).
  ...namespaced('property.tabs', PROPERTY_TABS_DEFAULTS),
  ...namespaced('building.kinds', BUILDING_KINDS_DEFAULTS),
  ...namespaced('contact.kinds', CONTACT_KINDS_DEFAULTS),
  ...namespaced('attachment.kinds', ATTACHMENT_KINDS_DEFAULTS),
  // W3-3 / EH-M (ADR-0029) — field / mobile / PWA.
  ...namespaced('field.tabs', FIELD_TABS_DEFAULTS),
  ...namespaced('field.check-in', FIELD_CHECK_IN_DEFAULTS),
  ...namespaced('field.install', FIELD_INSTALL_DEFAULTS),
  ...namespaced('field', FIELD_MISC_DEFAULTS),
  // W3-1 / EH-J — in-app notification chrome (ADR-0027).
  ...namespaced('notification', NOTIFICATION_DEFAULTS),
  // W3-2 / EH-K — reports + dashboard chrome (ADR-0030).
  ...namespaced('reports.titles', REPORTS_TITLE_DEFAULTS),
  ...namespaced('dashboard.kpis', DASHBOARD_KPI_DEFAULTS),
  ...namespaced('dashboard.range', DASHBOARD_RANGE_DEFAULTS),
  ...namespaced('dashboard', DASHBOARD_MISC_DEFAULTS),
  // W3-4 / EH-N + EH-O — sub & homeowner portals (ADR-0031/0032).
  ...namespaced('sub.tabs', SUB_TABS_DEFAULTS),
  ...namespaced('sub.coi', SUB_COI_DEFAULTS),
  ...namespaced('sub.quote', SUB_QUOTE_DEFAULTS),
  ...namespaced('homeowner.tabs', HOMEOWNER_TABS_DEFAULTS),
  ...namespaced('homeowner.quote', HOMEOWNER_QUOTE_DEFAULTS),
  ...namespaced('homeowner.invoice', HOMEOWNER_INVOICE_DEFAULTS),
  ...namespaced('homeowner.empty', HOMEOWNER_EMPTY_DEFAULTS),
  // W4-1 / EH-P + EH-I + EH-D — search, saved-views, MFA, login, perms.
  ...namespaced('search', SEARCH_DEFAULTS),
  ...namespaced('saved-views', SAVED_VIEWS_DEFAULTS),
  ...namespaced('mfa.setup', MFA_SETUP_DEFAULTS),
  ...namespaced('mfa.disable', MFA_DISABLE_DEFAULTS),
  ...namespaced('login.locked', LOGIN_LOCKED_DEFAULTS),
  ...namespaced('login.mfa', LOGIN_MFA_DEFAULTS),
  ...namespaced('permissions.matrix', PERMISSIONS_MATRIX_DEFAULTS),
  ...namespaced('permissions.matrix.state', PERMISSIONS_MATRIX_STATE_DEFAULTS),
  // W5-4 (ADR-0038) — privacy + compliance chrome.
  ...namespaced('legal.privacy', LEGAL_PRIVACY_DEFAULTS),
  ...namespaced('legal.terms', LEGAL_TERMS_DEFAULTS),
  ...namespaced('legal.dpa', LEGAL_DPA_DEFAULTS),
  ...namespaced('legal.account', LEGAL_ACCOUNT_DEFAULTS),
}

/**
 * Resolve a `(namespace, key)` to its default if known, else null. Used by
 * the unit test and the editor's "show default in greyed text" UX.
 */
export function getDefaultLabel(namespace: string, key: string): string | null {
  return DEFAULT_LABELS[`${namespace}.${key}`] ?? null
}

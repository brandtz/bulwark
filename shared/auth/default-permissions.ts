/**
 * shared/auth/default-permissions.ts — static permission catalog
 * (W2-5 / EH-I / ADR-0025).
 *
 * # What this file does
 *   - Source of truth for the ~30 permission slugs Bulwark v1 ships
 *     with, organized by section. Each slug names a discrete UI/API
 *     gate; admins toggle them per role via `/settings/permissions`.
 *   - Encodes the per-role default value for each slug. The DB
 *     `permissions` table only ever stores OVERRIDES; when no override
 *     row exists the default below is the answer.
 *
 * # Decisions (ADR-0025-permission-overrides, ADR-0008)
 *   - **Catalog-in-code.** Adding a slug ships with a release rather
 *     than a migration. The same pattern is used by trades + statuses.
 *   - **Grouped for UX.** The matrix page renders one block per
 *     `section`. Sections are stable strings, not enums, so a new
 *     section doesn't ripple the type system.
 *   - **No "all allowed" wildcards.** Every slug is enumerated; a
 *     wildcard would obscure which capabilities exist and make
 *     auditing harder.
 *   - **super_admin defaults to `true` for everything.** Override
 *     rows can still deny — but we never want a brand-new permission
 *     to lock the platform out by default.
 *
 * # Decision cast down
 *   - Generating defaults from existing `requiredRoles` page-meta.
 *     Rejected: the matrix needs finer granularity (e.g.
 *     `quote.send` vs `quote.create`) than route gating provides.
 */
import type { Role } from '../contracts/_shared'

export interface PermissionDefinition {
  slug: string
  section: string
  label: string
  /** Per-role default. Missing role → falls back to false. */
  defaults: Partial<Record<Role, boolean>>
}

/** Convenience: `true` for every role in a list. */
function allow(...roles: Role[]): Partial<Record<Role, boolean>> {
  const out: Partial<Record<Role, boolean>> = {}
  for (const r of roles) out[r] = true
  return out
}

const ADMIN_ROLES: Role[] = ['super_admin', 'org_admin', 'org_manager']
const ADMIN_OR_FIELD: Role[] = ['super_admin', 'org_admin', 'org_manager', 'field']
const ALL_ROLES: Role[] = [
  'super_admin',
  'org_admin',
  'org_manager',
  'field',
  'sub_contractor',
  'homeowner',
  'viewer',
]

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // Properties ----------------------------------------------------------
  { slug: 'property.view', section: 'Properties', label: 'View properties', defaults: allow(...ALL_ROLES) },
  { slug: 'property.create', section: 'Properties', label: 'Create properties', defaults: allow(...ADMIN_OR_FIELD) },
  { slug: 'property.edit', section: 'Properties', label: 'Edit properties', defaults: allow(...ADMIN_OR_FIELD) },
  { slug: 'property.delete', section: 'Properties', label: 'Delete properties', defaults: allow(...ADMIN_ROLES) },
  // Inspections --------------------------------------------------------
  { slug: 'inspection.view', section: 'Inspections', label: 'View inspections', defaults: allow(...ALL_ROLES) },
  { slug: 'inspection.create', section: 'Inspections', label: 'Create inspections', defaults: allow(...ADMIN_OR_FIELD) },
  { slug: 'inspection.complete', section: 'Inspections', label: 'Complete inspections', defaults: allow(...ADMIN_OR_FIELD) },
  // Quotes -------------------------------------------------------------
  { slug: 'quote.view', section: 'Quotes', label: 'View quotes', defaults: allow(...ADMIN_ROLES, 'field', 'viewer') },
  { slug: 'quote.create', section: 'Quotes', label: 'Create quotes', defaults: allow(...ADMIN_ROLES) },
  { slug: 'quote.send', section: 'Quotes', label: 'Send quotes', defaults: allow(...ADMIN_ROLES) },
  { slug: 'quote.accept', section: 'Quotes', label: 'Accept quotes', defaults: allow(...ADMIN_ROLES) },
  // Work orders --------------------------------------------------------
  { slug: 'wo.view', section: 'Work orders', label: 'View work orders', defaults: allow(...ADMIN_OR_FIELD, 'sub_contractor', 'viewer') },
  { slug: 'wo.create', section: 'Work orders', label: 'Create work orders', defaults: allow(...ADMIN_ROLES) },
  { slug: 'wo.assign', section: 'Work orders', label: 'Assign work orders', defaults: allow(...ADMIN_ROLES) },
  { slug: 'wo.progress', section: 'Work orders', label: 'Update progress', defaults: allow(...ADMIN_OR_FIELD, 'sub_contractor') },
  // Invoices -----------------------------------------------------------
  { slug: 'invoice.view', section: 'Invoices', label: 'View invoices', defaults: allow(...ADMIN_ROLES, 'viewer') },
  { slug: 'invoice.create', section: 'Invoices', label: 'Create invoices', defaults: allow(...ADMIN_ROLES) },
  { slug: 'invoice.send', section: 'Invoices', label: 'Send invoices', defaults: allow(...ADMIN_ROLES) },
  { slug: 'invoice.record_payment', section: 'Invoices', label: 'Record payments', defaults: allow(...ADMIN_ROLES) },
  // Compliance ---------------------------------------------------------
  { slug: 'compliance.view', section: 'Compliance', label: 'View compliance docs', defaults: allow(...ALL_ROLES) },
  { slug: 'compliance.generate', section: 'Compliance', label: 'Generate compliance docs', defaults: allow(...ADMIN_ROLES) },
  // Admin --------------------------------------------------------------
  { slug: 'admin.users.manage', section: 'Admin', label: 'Manage users + invites', defaults: allow(...ADMIN_ROLES) },
  { slug: 'admin.settings.edit', section: 'Admin', label: 'Edit org settings', defaults: allow(...ADMIN_ROLES) },
  { slug: 'admin.permissions.edit', section: 'Admin', label: 'Edit permission overrides', defaults: allow('super_admin', 'org_admin') },
  { slug: 'admin.feature_flags.edit', section: 'Admin', label: 'Edit feature flags', defaults: allow('super_admin') },
  { slug: 'admin.providers.edit', section: 'Admin', label: 'Edit provider configs', defaults: allow(...ADMIN_ROLES) },
  { slug: 'admin.webhooks.edit', section: 'Admin', label: 'Edit webhooks', defaults: allow(...ADMIN_ROLES) },
  { slug: 'admin.audit.view', section: 'Admin', label: 'View audit log', defaults: allow(...ADMIN_ROLES) },
]

export const PERMISSION_SLUGS: string[] = PERMISSION_CATALOG.map((p) => p.slug)

/** All section headers, in catalog order, dedup-preserved. */
export const PERMISSION_SECTIONS: string[] = Array.from(
  new Set(PERMISSION_CATALOG.map((p) => p.section)),
)

/**
 * Return the static default for a (role, slug) pair. Unknown slugs and
 * missing role entries default to `false` — we fail closed.
 */
export function getDefaultPermission(role: Role, slug: string): boolean {
  const def = PERMISSION_CATALOG.find((p) => p.slug === slug)
  if (!def) return false
  return def.defaults[role] === true
}

/**
 * Materialize the full Record<slug, boolean> for a role using ONLY the
 * static defaults. The service layer merges per-org overrides on top.
 */
export function getDefaultPermissionsForRole(role: Role): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const def of PERMISSION_CATALOG) out[def.slug] = def.defaults[role] === true
  return out
}

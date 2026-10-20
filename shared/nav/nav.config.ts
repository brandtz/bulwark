/**
 * shared/nav/nav.config.ts — single source of truth for persistent nav.
 *
 * Per ADR-0005:
 *   - This is the ONLY place nav items are declared.
 *   - Each section is gated by role(s); a user sees only sections their
 *     active role appears in.
 *   - Adding a new screen = adding a row here. Hiding a screen for a role =
 *     removing that role from the row's `roles` array.
 *
 * Sidebar order is the array order. Bottom nav (mobile) shows the items
 * flagged `mobile: true` — typically a 4-or-5-item subset per role.
 *
 * Decisions NOT taken:
 *   - No nested submenus in v1. STYLE_GUIDE §6.6 favors a flat sidebar for
 *     scan speed; if a section grows past ~7 items we split it into a
 *     section header + flat items, not a fly-out.
 *   - We do NOT use the icon name to import an icon component here — the
 *     navigation component resolves icons by name (E1-S2).
 */
/**
 * shared/nav/nav.config.ts — single source of truth for persistent nav (WP-A5).
 *
 * Per ADR-0005 and WP-A5:
 *   - This is the ONLY place nav items are declared.
 *   - Each item is gated by `roles[]` and an optional `featureFlag`.
 *   - Reserved module items (Schedule, Crew, Vendors, Purchase orders,
 *     Price book, Tickets, Timesheets) carry `featureFlag` so they stay
 *     hidden until their feature flag is enabled.
 *   - Bottom nav (mobile) shows at most 5 items per role (4 primary + More sheet).
 */
import type { Role } from '../contracts/_shared'

export type NavItem = {
  label: string
  to: string
  icon: string // mapped to BulwarkIcon name (ICON_NAMES)
  roles: Role[]
  mobile?: boolean // true = surface in mobile bottom-nav
  group?: string // optional sidebar section heading
  featureFlag?: string // optional feature flag key required to display this item
}

export const NAV_ITEMS: NavItem[] = [
  // ----------------------- Admin / Owner / Manager ------------------------
  { group: 'Operations', label: 'Dashboard',      to: '/admin',                icon: 'home',        roles: ['super_admin', 'org_admin', 'org_manager'], mobile: true  },
  { group: 'Operations', label: 'Properties',     to: '/admin/properties',     icon: 'building',    roles: ['super_admin', 'org_admin', 'org_manager'], mobile: true  },
  { group: 'Operations', label: 'Jobs',           to: '/admin/work-orders',    icon: 'briefcase',   roles: ['super_admin', 'org_admin', 'org_manager'], mobile: true  },
  { group: 'Operations', label: 'Dispatch',       to: '/admin/dispatch',       icon: 'calendar',    roles: ['super_admin', 'org_admin', 'org_manager']                  },
  { group: 'Operations', label: 'Schedule',       to: '/admin/dispatch',       icon: 'calendar',    roles: ['super_admin', 'org_admin', 'org_manager'], featureFlag: 'module.schedule' },
  { group: 'Operations', label: 'Quotes',         to: '/admin/quotes',         icon: 'file-text',   roles: ['super_admin', 'org_admin', 'org_manager']                  },
  { group: 'Operations', label: 'Invoices',       to: '/admin/invoices',       icon: 'dollar-sign', roles: ['super_admin', 'org_admin', 'org_manager']                  },
  { group: 'Operations', label: 'Documents',      to: '/admin/compliance',     icon: 'shield',      roles: ['super_admin', 'org_admin', 'org_manager']                  },

  // ------------------------------- Insights -------------------------------
  { group: 'Insights',   label: 'Reports',        to: '/admin/reports',        icon: 'file-text',   roles: ['super_admin', 'org_admin', 'org_manager']                  },

  // -------------------------------- People --------------------------------
  { group: 'People',     label: 'Clients',        to: '/admin/clients',        icon: 'user',        roles: ['super_admin', 'org_admin', 'org_manager']                  },
  { group: 'People',     label: 'Subcontractors', to: '/admin/subcontractors', icon: 'users',       roles: ['super_admin', 'org_admin', 'org_manager']                  },
  { group: 'People',     label: 'Crew',           to: '/admin/subcontractors', icon: 'users',       roles: ['super_admin', 'org_admin', 'org_manager'], featureFlag: 'module.crew' },
  { group: 'People',     label: 'Timesheets',     to: '/admin/work-orders',    icon: 'clock',       roles: ['super_admin', 'org_admin', 'org_manager'], featureFlag: 'module.timesheets' },

  // ------------------------------ Purchasing ------------------------------
  { group: 'Purchasing', label: 'Vendors',         to: '/settings/catalog',    icon: 'briefcase',   roles: ['super_admin', 'org_admin', 'org_manager'], featureFlag: 'module.vendors' },
  { group: 'Purchasing', label: 'Purchase orders', to: '/settings/catalog',    icon: 'clipboard',   roles: ['super_admin', 'org_admin', 'org_manager'], featureFlag: 'module.purchase_orders' },
  { group: 'Purchasing', label: 'Price book',      to: '/settings/catalog',    icon: 'file-text',   roles: ['super_admin', 'org_admin', 'org_manager'], featureFlag: 'module.pricebook' },

  // ------------------------------- Service --------------------------------
  { group: 'Service',    label: 'Tickets',         to: '/admin/work-orders',   icon: 'clipboard',   roles: ['super_admin', 'org_admin', 'org_manager'], featureFlag: 'module.tickets' },

  // -------------------------------- Admin ---------------------------------
  { group: 'Admin',      label: 'Settings',       to: '/settings',             icon: 'settings',    roles: ['super_admin', 'org_admin'],               mobile: true  },

  // ------------------------------- Field GC -------------------------------
  { group: 'Field',      label: 'Today',          to: '/field',                icon: 'clock',      roles: ['field'],            mobile: true },
  { group: 'Field',      label: 'My properties',  to: '/field/properties',     icon: 'home',        roles: ['field'],            mobile: true },
  { group: 'Field',      label: 'Inspections',    to: '/field/assessments',    icon: 'clipboard',   roles: ['field']                          },
  { group: 'Field',      label: 'Sync queue',     to: '/field/sync-queue',     icon: 'refresh',    roles: ['field']                          },
  { group: 'Field',      label: 'Time clock',     to: '/field/check-in',       icon: 'clock',      roles: ['field']                          },
  { group: 'Field',      label: 'Check in to job', to: '/field/work-orders',    icon: 'check-circle', roles: ['field']                        },
  { group: 'Field',      label: 'Jobs',           to: '/field/work-orders',    icon: 'wrench',     roles: ['field'],            mobile: true },

  // ----------------------------- Subcontractor ---------------------------
  { group: 'Sub',        label: 'Home',           to: '/sub',                  icon: 'home',        roles: ['sub_contractor'],   mobile: true },
  { group: 'Sub',        label: 'Jobs',           to: '/sub/work-orders',      icon: 'wrench',      roles: ['sub_contractor'],   mobile: true },
  { group: 'Sub',        label: 'Quotes',         to: '/sub/quotes',           icon: 'file-text',   roles: ['sub_contractor'],   mobile: true },
  { group: 'Sub',        label: 'COIs',           to: '/sub/cois',             icon: 'shield',      roles: ['sub_contractor'],   mobile: true },
  { group: 'Sub',        label: 'Settings',       to: '/sub/settings',         icon: 'settings',    roles: ['sub_contractor'],   mobile: false },

  // ------------------------------ Homeowner ------------------------------
  { group: 'Homeowner',  label: 'Home',           to: '/homeowner',            icon: 'home',        roles: ['homeowner'], mobile: true },
  { group: 'Homeowner',  label: 'Properties',     to: '/homeowner/properties', icon: 'home',        roles: ['homeowner'], mobile: true },
  { group: 'Homeowner',  label: 'Quotes',         to: '/homeowner/quotes',     icon: 'file-text',   roles: ['homeowner'], mobile: true },
  { group: 'Homeowner',  label: 'Invoices',       to: '/homeowner/invoices',   icon: 'dollar-sign', roles: ['homeowner'], mobile: true },

  // -------------------------------- Common -------------------------------
  { group: 'You',        label: 'Profile',        to: '/profile',              icon: 'user',        roles: ['super_admin', 'org_admin', 'org_manager', 'field', 'sub_contractor', 'viewer', 'homeowner', 'stakeholder'] },
]

function isFlagEnabled(flag: string | undefined, enabledFlags?: ReadonlySet<string> | Record<string, boolean>): boolean {
  if (!flag) return true
  if (!enabledFlags) return false
  if (enabledFlags instanceof Set) return enabledFlags.has(flag)
  return Boolean((enabledFlags as Record<string, boolean>)[flag])
}

/** Sidebar items for a given role and optional enabled feature flags, preserving declared order. */
export function navItemsForRole(
  role: Role,
  enabledFlags?: ReadonlySet<string> | Record<string, boolean>,
): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role) && isFlagEnabled(item.featureFlag, enabledFlags))
}

/** Mobile bottom-nav items for a given role (max 5 by STYLE_GUIDE §6.6; reserves room for More sheet when needed). */
export function mobileNavItemsForRole(
  role: Role,
  enabledFlags?: ReadonlySet<string> | Record<string, boolean>,
): NavItem[] {
  return navItemsForRole(role, enabledFlags)
    .filter((item) => item.mobile)
    .slice(0, 4)
}

/** Overflow items for the mobile More sheet (SH-10): role items not already shown in the primary bottom nav. */
export function overflowNavItemsForRole(
  role: Role,
  enabledFlags?: ReadonlySet<string> | Record<string, boolean>,
): NavItem[] {
  const all = navItemsForRole(role, enabledFlags)
  const mobileSet = new Set(mobileNavItemsForRole(role, enabledFlags).map((item) => `${item.group ?? ''}:${item.label}:${item.to}`))
  return all.filter((item) => !mobileSet.has(`${item.group ?? ''}:${item.label}:${item.to}`))
}

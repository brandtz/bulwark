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
import type { Role } from '../contracts/_shared'

export type NavItem = {
  label: string
  to: string
  icon: string         // mapped to a Vue component in the AppSidebar
  roles: Role[]
  mobile?: boolean     // true = surface in mobile bottom-nav
  group?: string       // optional sidebar section heading
}

export const NAV_ITEMS: NavItem[] = [
  // ----------------------- Admin / Owner / Manager ------------------------
  { group: 'Operations', label: 'Pipeline',       to: '/admin/pipeline',       icon: 'kanban',     roles: ['super_admin','org_admin','org_manager'], mobile: true  },
  { group: 'Operations', label: 'Properties',     to: '/admin/properties',     icon: 'home',       roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'Operations', label: 'Work orders',    to: '/admin/work-orders',    icon: 'clipboard',  roles: ['super_admin','org_admin','org_manager'], mobile: true  },
  { group: 'Operations', label: 'Quotes',         to: '/admin/quotes',         icon: 'document',   roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'Operations', label: 'Invoices',       to: '/admin/invoices',       icon: 'receipt',    roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'Operations', label: 'Compliance',     to: '/admin/compliance',     icon: 'shield',     roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'People',     label: 'Subcontractors', to: '/admin/subcontractors', icon: 'users',      roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'People',     label: 'Clients',        to: '/admin/clients',        icon: 'user',       roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'Admin',      label: 'Settings',       to: '/settings',             icon: 'cog',        roles: ['super_admin','org_admin'],               mobile: true  },

  // ------------------------------- Field GC -------------------------------
  { group: 'Field',      label: 'Today',          to: '/field/dashboard',      icon: 'sun',        roles: ['field'],            mobile: true },
  { group: 'Field',      label: 'My properties',  to: '/field/properties',     icon: 'home',       roles: ['field'],            mobile: true },
  { group: 'Field',      label: 'Assessments',    to: '/field/assessments',    icon: 'clipboard',  roles: ['field']                          },
  { group: 'Field',      label: 'Work orders',    to: '/field/work-orders',    icon: 'wrench',     roles: ['field'],            mobile: true },

  // ----------------------------- Subcontractor ---------------------------
  { group: 'Sub',        label: 'My jobs',        to: '/sub/dashboard',        icon: 'briefcase',  roles: ['sub_contractor'],   mobile: true },
  { group: 'Sub',        label: 'Profile',        to: '/sub/profile',          icon: 'user',       roles: ['sub_contractor'],   mobile: true },

  // -------------------------------- Common -------------------------------
  { group: 'You',        label: 'Profile',        to: '/profile',              icon: 'user',       roles: ['super_admin','org_admin','org_manager','field','sub_contractor','viewer'] },
]

/** Sidebar items for a given role, preserving declared order. */
export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter(item => item.roles.includes(role))
}

/** Mobile bottom-nav items for a given role (max 5 by STYLE_GUIDE §6.6). */
export function mobileNavItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter(item => item.roles.includes(role) && item.mobile).slice(0, 5)
}

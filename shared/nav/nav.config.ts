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
  // W3-2 / EH-K — admin dashboard is the new landing page; reports surface
  // is a separate top-level group so it's findable without polluting Operations.
  { group: 'Operations', label: 'Dashboard',      to: '/admin',                icon: 'home',       roles: ['super_admin','org_admin','org_manager'], mobile: true  },
  // Note (2026-05-06 audit): the original "Pipeline" entry pointed at
  // `/admin/pipeline` which never had a page. The kanban view is built
  // into /admin/properties (toggle between kanban + list there), so the
  // dedicated Pipeline row was a dead link. Removed.
  { group: 'Operations', label: 'Properties',     to: '/admin/properties',     icon: 'home',       roles: ['super_admin','org_admin','org_manager'], mobile: true  },
  { group: 'Operations', label: 'Work orders',    to: '/admin/work-orders',    icon: 'clipboard',  roles: ['super_admin','org_admin','org_manager'], mobile: true  },
  // W2-3 / EH-G — 7-day dispatch board (subs × days kanban).
  { group: 'Operations', label: 'Dispatch',       to: '/admin/dispatch',       icon: 'calendar',   roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'Operations', label: 'Quotes',         to: '/admin/quotes',         icon: 'file-text',  roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'Operations', label: 'Invoices',       to: '/admin/invoices',       icon: 'dollar-sign',roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'Operations', label: 'Compliance',     to: '/admin/compliance',     icon: 'shield',     roles: ['super_admin','org_admin','org_manager']                  },
  // W3-2 / EH-K — reports landing page.
  { group: 'Insights',   label: 'Reports',        to: '/admin/reports',        icon: 'file-text',  roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'People',     label: 'Subcontractors', to: '/admin/subcontractors', icon: 'users',      roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'People',     label: 'Clients',        to: '/admin/clients',        icon: 'user',       roles: ['super_admin','org_admin','org_manager']                  },
  { group: 'Admin',      label: 'Settings',       to: '/settings',             icon: 'settings',   roles: ['super_admin','org_admin'],               mobile: true  },

  // ------------------------------- Field GC -------------------------------
  // (W2-6) icon strings were normalized to BulwarkIcon sprite names
  // (`document` -> `file-text`, `receipt` -> `dollar-sign`, `cog` ->
  // `settings`, `sun` -> `clock`). The sidebar renders glyphs via
  // <BulwarkIcon :name="item.icon" /> so the strings must match the
  // ICON_NAMES registry in app/components/ui/icon-names.ts.
  { group: 'Field',      label: 'Today',          to: '/field/dashboard',      icon: 'clock',      roles: ['field'],            mobile: true },
  { group: 'Field',      label: 'My properties',  to: '/field/properties',     icon: 'home',       roles: ['field'],            mobile: true },
  { group: 'Field',      label: 'Assessments',    to: '/field/assessments',    icon: 'clipboard',  roles: ['field']                          },
  { group: 'Field',      label: 'Work orders',    to: '/field/work-orders',    icon: 'wrench',     roles: ['field'],            mobile: true },

  // ----------------------------- Subcontractor ---------------------------
  // W3-4 / EH-N — sub portal expanded (ADR-0031). The legacy
  // /sub/dashboard + /sub/profile entries are kept as alias rows so
  // existing bookmarks/tests continue to work; primary entry is /sub.
  { group: 'Sub',        label: 'Home',           to: '/sub',                  icon: 'home',       roles: ['sub_contractor'],   mobile: true },
  { group: 'Sub',        label: 'Work orders',    to: '/sub/work-orders',      icon: 'wrench',     roles: ['sub_contractor'],   mobile: true },
  { group: 'Sub',        label: 'Quotes',         to: '/sub/quotes',           icon: 'file-text',  roles: ['sub_contractor'],   mobile: true },
  { group: 'Sub',        label: 'COIs',           to: '/sub/cois',             icon: 'shield',     roles: ['sub_contractor'],   mobile: true },
  { group: 'Sub',        label: 'Settings',       to: '/sub/settings',         icon: 'settings',   roles: ['sub_contractor'],   mobile: true },

  // ------------------------------ Homeowner ------------------------------
  // W3-4 / EH-O — homeowner portal (ADR-0032).
  { group: 'Homeowner',  label: 'Home',           to: '/homeowner',                  icon: 'home',        roles: ['homeowner'], mobile: true },
  { group: 'Homeowner',  label: 'Properties',     to: '/homeowner/properties',       icon: 'home',        roles: ['homeowner'], mobile: true },
  { group: 'Homeowner',  label: 'Quotes',         to: '/homeowner/quotes',           icon: 'file-text',   roles: ['homeowner'], mobile: true },
  { group: 'Homeowner',  label: 'Invoices',       to: '/homeowner/invoices',         icon: 'dollar-sign', roles: ['homeowner'], mobile: true },

  // -------------------------------- Common -------------------------------
  { group: 'You',        label: 'Profile',        to: '/profile',              icon: 'user',       roles: ['super_admin','org_admin','org_manager','field','sub_contractor','viewer','homeowner'] },
]

/** Sidebar items for a given role, preserving declared order. */
export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter(item => item.roles.includes(role))
}

/** Mobile bottom-nav items for a given role (max 5 by STYLE_GUIDE §6.6). */
export function mobileNavItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter(item => item.roles.includes(role) && item.mobile).slice(0, 5)
}

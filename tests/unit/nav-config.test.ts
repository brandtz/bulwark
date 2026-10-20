/**
 * tests/unit/nav-config.test.ts — WP-A5 navigation configuration invariants.
 *
 * Asserts:
 *   1. Mobile bottom nav never exceeds 5 items (≤4 primary + 1 More sheet) for any role,
 *      with or without all feature flags enabled.
 *   2. Every `to` target in NAV_ITEMS resolves to a real page in the CodeGraph.
 *   3. Every `icon` in NAV_ITEMS is a registered BulwarkIcon name in ICON_NAMES.
 *   4. Reserved module items (Schedule, Crew, Timesheets, Vendors, Purchase orders,
 *      Price book, Tickets) are hidden by default and appear only when their
 *      `featureFlag` is enabled.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  NAV_ITEMS,
  mobileNavItemsForRole,
  navItemsForRole,
  overflowNavItemsForRole,
} from '~~/shared/nav/nav.config'
import { RoleSchema } from '~~/shared/contracts/_shared'
import { ICON_NAMES } from '~~/app/components/ui/icon-names'

const GRAPH_PATH = fileURLToPath(new URL('../../agents/codegraph/graph.json', import.meta.url))
const GRAPH = JSON.parse(readFileSync(GRAPH_PATH, 'utf8')) as {
  nodes: Array<{ id: string; type: string; route?: string }>
}
const PAGE_ROUTES = new Set(
  GRAPH.nodes.filter((n) => n.type === 'page' && typeof n.route === 'string').map((n) => n.route!),
)
const VALID_ICONS = new Set<string>(ICON_NAMES)

describe('shared/nav/nav.config.ts (WP-A5)', () => {
  it('every NAV_ITEMS entry uses a registered BulwarkIcon name', () => {
    for (const item of NAV_ITEMS) {
      expect(VALID_ICONS.has(item.icon), `Invalid icon "${item.icon}" on nav item "${item.label}"`).toBe(true)
    }
  })

  it('every NAV_ITEMS `to` route matches an existing page in codegraph (no dead routes)', () => {
    for (const item of NAV_ITEMS) {
      expect(
        PAGE_ROUTES.has(item.to),
        `Nav item "${item.label}" points to non-existent route "${item.to}"`,
      ).toBe(true)
    }
  })

  it('mobile bottom nav never exceeds 5 items (≤4 primary + More sheet) for any role', () => {
    const allFlags = new Set(NAV_ITEMS.map((i) => i.featureFlag).filter((f): f is string => Boolean(f)))
    for (const role of RoleSchema.options) {
      const defaultMobile = mobileNavItemsForRole(role)
      expect(defaultMobile.length, `Role ${role} default mobile items`).toBeLessThanOrEqual(4)
      expect(defaultMobile.length + 1, `Role ${role} mobile tabs + More`).toBeLessThanOrEqual(5)

      const flaggedMobile = mobileNavItemsForRole(role, allFlags)
      expect(flaggedMobile.length, `Role ${role} flagged mobile items`).toBeLessThanOrEqual(4)
      expect(flaggedMobile.length + 1, `Role ${role} flagged mobile tabs + More`).toBeLessThanOrEqual(5)
    }
  })

  it('respects featureFlag gating for reserved module groups (Schedule, Crew, Vendors, Purchase orders, Price book, Tickets, Timesheets)', () => {
    const reservedFlags = [
      'module.schedule',
      'module.crew',
      'module.timesheets',
      'module.vendors',
      'module.purchase_orders',
      'module.pricebook',
      'module.tickets',
    ]

    const withoutFlags = navItemsForRole('org_admin')
    for (const flag of reservedFlags) {
      expect(
        withoutFlags.some((i) => i.featureFlag === flag),
        `Flagged item ${flag} should be hidden when flag is off`,
      ).toBe(false)
    }

    const withAllFlags = navItemsForRole('org_admin', new Set(reservedFlags))
    for (const flag of reservedFlags) {
      expect(
        withAllFlags.some((i) => i.featureFlag === flag),
        `Flagged item ${flag} should be visible when flag is enabled`,
      ).toBe(true)
    }
  })

  it('overflowNavItemsForRole excludes items already in the mobile primary bar', () => {
    for (const role of RoleSchema.options) {
      const primary = new Set(mobileNavItemsForRole(role).map((i) => `${i.group ?? ''}:${i.label}:${i.to}`))
      const overflow = overflowNavItemsForRole(role)
      for (const item of overflow) {
        const key = `${item.group ?? ''}:${item.label}:${item.to}`
        expect(primary.has(key), `Overflow item ${key} duplicates a mobile primary item for ${role}`).toBe(false)
      }
    }
  })

  it('exposes the field sync queue and check-in surfaces from the More sheet', () => {
    const labels = overflowNavItemsForRole('field').map((item) => item.label)
    expect(labels).toEqual(expect.arrayContaining(['Sync queue', 'Time clock', 'Check in to job']))
  })
})

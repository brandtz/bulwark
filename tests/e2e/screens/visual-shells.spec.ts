/**
 * WP-A5 — shell geometry and theme contract across 6 shells × 2 viewports × 2 themes.
 *
 * The Packet A screenshots contain Northline sample branding, enabled modules, and
 * page content. Those are tenant- and feature-flag-dependent and page content is
 * explicitly outside WP-A5 scope, so full-page pixel comparisons are not meaningful
 * against the Bulwark mock personas. This matrix checks the stable shell dimensions,
 * responsive navigation placement, and theme tokens instead.
 */
import { test, expect } from '@playwright/test'
import { PERSONAS, setTheme } from './_contract'
import { signIn } from '../_helpers'

interface ShellSpec {
  id: string
  route: string
  role: string
  desktopIndicator: string
  mobileIndicator: string
  header: string
  sidebar: boolean
  secondaryNav?: boolean
  bottomNav: 'mobile-only' | 'always' | 'none'
  nav?: string
}

const shells: ShellSpec[] = [
  {
    id: 'admin',
    route: '/admin/dashboard',
    role: 'org_admin',
    desktopIndicator: 'app-sidebar',
    mobileIndicator: 'mobile-bottom-nav',
    header: 'app-topbar',
    sidebar: true,
    bottomNav: 'mobile-only',
    nav: 'mobile-bottom-nav',
  },
  {
    id: 'settings',
    route: '/settings',
    role: 'org_admin',
    desktopIndicator: 'settings-layout',
    mobileIndicator: 'settings-layout',
    header: 'app-topbar',
    sidebar: true,
    secondaryNav: true,
    bottomNav: 'mobile-only',
    nav: 'mobile-bottom-nav',
  },
  {
    id: 'field',
    route: '/field',
    role: 'field',
    desktopIndicator: 'field-layout',
    mobileIndicator: 'field-layout',
    header: 'field-header',
    sidebar: false,
    bottomNav: 'always',
    nav: 'field-tabs',
  },
  {
    id: 'sub',
    route: '/sub',
    role: 'sub_contractor',
    desktopIndicator: 'sub-layout',
    mobileIndicator: 'sub-layout',
    header: 'sub-header',
    sidebar: false,
    bottomNav: 'always',
    nav: 'sub-tabs',
  },
  {
    id: 'client',
    route: '/homeowner',
    role: 'homeowner',
    desktopIndicator: 'homeowner-layout',
    mobileIndicator: 'homeowner-layout',
    header: 'homeowner-header',
    sidebar: false,
    bottomNav: 'always',
    nav: 'homeowner-tabs',
  },
  {
    id: 'stakeholder',
    route: '/profile',
    role: 'stakeholder',
    desktopIndicator: 'stakeholder-layout',
    mobileIndicator: 'stakeholder-layout',
    header: 'stakeholder-header',
    sidebar: false,
    bottomNav: 'none',
  },
] as const

for (const shell of shells) {
  for (const viewport of ['desktop', 'mobile'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`WP-A5 shell geometry: ${shell.id} ${viewport} ${theme}`, async ({ page, context }) => {
        await signIn(context, PERSONAS[shell.role]!)
        await setTheme(page, theme)
        await page.setViewportSize(viewport === 'desktop'
          ? { width: 1440, height: 900 }
          : { width: 390, height: 844 })
        await page.goto(shell.route, { waitUntil: 'domcontentloaded' })
        await expect(page.getByTestId(viewport === 'desktop' ? shell.desktopIndicator : shell.mobileIndicator)).toBeVisible()
        await expect(page.getByTestId(shell.header)).toBeVisible()
        if (shell.id === 'stakeholder') {
          await expect(page.getByTestId('stakeholder-readonly-banner')).toBeVisible()
        }

        const dimensions = await page.evaluate(({ headerId, navId }) => {
          const byTestId = (id: string | undefined) => id
            ? document.querySelector(`[data-testid="${id}"]`)
            : null
          const rect = (element: Element | null) => {
            if (!element) return null
            const box = element.getBoundingClientRect()
            return {
              x: Math.round(box.x),
              y: Math.round(box.y),
              width: Math.round(box.width),
              height: Math.round(box.height),
              bottom: Math.round(box.bottom),
            }
          }
          return {
            theme: document.documentElement.getAttribute('data-theme'),
            colorScheme: getComputedStyle(document.documentElement).colorScheme,
            cardBackground: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            header: rect(byTestId(headerId)),
            sidebar: rect(byTestId('app-sidebar')),
            settingsNav: rect(byTestId('settings-secondary-nav')),
            bottomNav: rect(byTestId(navId)),
          }
        }, { headerId: shell.header, navId: shell.nav })

        expect(dimensions.theme).toBe(theme)
        expect(dimensions.colorScheme).toContain(theme)
        expect(dimensions.cardBackground).not.toBe('')
        expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
        expect(dimensions.header?.height).toBe(56)

        if (shell.sidebar && viewport === 'desktop') {
          expect(dimensions.sidebar?.width).toBe(240)
        } else {
          expect(dimensions.sidebar?.width ?? 0).toBe(0)
        }

        if (shell.secondaryNav) {
          expect(dimensions.settingsNav?.width ?? 0).toBe(viewport === 'desktop' ? 224 : 0)
        }

        if (shell.bottomNav === 'always' || (shell.bottomNav === 'mobile-only' && viewport === 'mobile')) {
          expect(dimensions.bottomNav?.height).toBe(64)
          expect(dimensions.bottomNav?.bottom).toBe(dimensions.viewportHeight)
        } else if (shell.bottomNav === 'mobile-only') {
          expect(dimensions.bottomNav?.height ?? 0).toBe(0)
        } else {
          expect(dimensions.bottomNav).toBeNull()
        }
      })
    }
  }
}

test('WP-A5 visual matrix defines all 24 shell comparisons', () => {
  expect(shells.length * 2 * 2).toBe(24)
})

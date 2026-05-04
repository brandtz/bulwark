/**
 * tests/e2e/persona-matrix.spec.ts — E2-S8 persona × route matrix.
 *
 * # Decisions (ADR-0007)
 *   - One spec per UI story. This file is the canonical proof that every
 *     persona's allow / deny list is enforced by the auth.global +
 *     role middleware combo. Earlier `role-guard.spec.ts` covers the
 *     happy/error-page rendering for E2-S3; THIS spec is the comprehensive
 *     matrix the epic demands.
 *   - We data-drive the matrix off a `CASES` table so adding a new
 *     protected route is a one-line change, not a copy/paste of a test.
 *   - "Allowed" is asserted by URL only (the page reaches its target
 *     without a redirect to /403 or /login). We deliberately do NOT also
 *     assert page-specific markup here — that belongs in each route's
 *     own spec. This file's contract is *routing*, not rendering.
 *   - Anonymous visits to a protected route must land on
 *     `/login?next=<encoded>` (302 from `auth.global`).
 *
 * # Decision cast down
 *   - Rejected: looping over routes inside a single test. Playwright tags
 *     each test with status individually, so a per-case `test()` block
 *     gives clearer pass/fail output (and lets us isolate flakes).
 */
import { test, expect } from '@playwright/test'
import { signIn, signOut } from './_helpers'

test.describe.configure({ mode: 'serial' })

type Outcome =
  | { kind: 'allow'; finalUrl: RegExp }
  | { kind: 'forbid' }
  | { kind: 'redirect-login' }

type PersonaKey = 'admin' | 'super' | 'field' | 'sub' | 'anonymous'

const PERSONAS: Record<Exclude<PersonaKey, 'anonymous'>, string> = {
  admin: 'drew@bulwark.demo',
  super: 'sasha@bulwark.platform',
  field: 'matthew@bulwark.demo',
  sub: 'jeff@bulwark.demo',
}

interface Case {
  route: string
  persona: PersonaKey
  outcome: Outcome
}

const ADMIN_OK: Outcome = { kind: 'allow', finalUrl: /\/admin\/dashboard$/ }
const PROPERTIES_OK: Outcome = { kind: 'allow', finalUrl: /\/admin\/properties$/ }
const FORBID: Outcome = { kind: 'forbid' }
const LOGIN: Outcome = { kind: 'redirect-login' }

const CASES: Case[] = [
  // /admin/dashboard
  { route: '/admin/dashboard', persona: 'admin', outcome: ADMIN_OK },
  { route: '/admin/dashboard', persona: 'super', outcome: ADMIN_OK },
  { route: '/admin/dashboard', persona: 'field', outcome: FORBID },
  { route: '/admin/dashboard', persona: 'sub', outcome: FORBID },
  { route: '/admin/dashboard', persona: 'anonymous', outcome: LOGIN },
  // /admin/properties
  { route: '/admin/properties', persona: 'admin', outcome: PROPERTIES_OK },
  { route: '/admin/properties', persona: 'super', outcome: PROPERTIES_OK },
  { route: '/admin/properties', persona: 'field', outcome: FORBID },
  { route: '/admin/properties', persona: 'sub', outcome: FORBID },
  { route: '/admin/properties', persona: 'anonymous', outcome: LOGIN },
]

test.describe('Persona × route matrix (E2-S8)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only flow')
    await signOut(page.context())
  })

  for (const c of CASES) {
    const label = `${c.persona.padEnd(9)} → ${c.route} (${c.outcome.kind})`
    test(label, async ({ page }) => {
      if (c.persona !== 'anonymous') {
        await signIn(page.context(), PERSONAS[c.persona])
      }
      await page.goto(c.route)

      switch (c.outcome.kind) {
        case 'allow':
          await expect(page).toHaveURL(c.outcome.finalUrl)
          // Persistent shell sanity — confirms we didn't render a layoutless error page.
          await expect(page.getByTestId('user-menu-button')).toBeVisible()
          break
        case 'forbid':
          await expect(page).toHaveURL(/\/403$/)
          await expect(page.getByTestId('forbidden-card')).toBeVisible()
          break
        case 'redirect-login': {
          await expect(page).toHaveURL(/\/login\?next=/)
          const url = new URL(page.url())
          expect(url.searchParams.get('next')).toBe(c.route)
          break
        }
      }
    })
  }
})

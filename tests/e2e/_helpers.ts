/**
 * tests/e2e/_helpers.ts — shared Playwright helpers.
 *
 * Bulwark's mock auth is cookie-backed (see app/plugins/services.ts).
 * Most specs need to start in a signed-in state without manually clicking
 * through /login on every test, so they call `signInAsAdmin(page)` in their
 * beforeEach. Tests that explicitly cover sign-out / redirect logic skip
 * this helper and use `signOut()` instead.
 *
 * Decision cast down: adding a Playwright `storageState` global fixture.
 * Rejected because three of our existing specs need DIFFERENT personas
 * (field worker for /field/dashboard, sub for /sub/dashboard) — a single
 * global state file forces awkward overrides.
 */
import type { BrowserContext, Page } from '@playwright/test'

export const PERSONA_COOKIE = 'bulwark.mock.persona'

/**
 * Real-backend demo password. Matches scripts/db-seed.mjs PERSONAS.
 * In real-backend mode every helper logs in via /api/services/auth/login,
 * which sets the nuxt-auth-utils `nuxt-session` cookie on the context.
 */
const REAL_DEMO_PASSWORD = 'BulwarkDemo!1'

function isRealBackend(): boolean {
  return process.env.BULWARK_BACKEND === 'real'
}

export async function signIn(context: BrowserContext, personaEmail: string): Promise<void> {
  if (isRealBackend()) {
    const res = await context.request.post('http://localhost:3000/api/services/auth/login', {
      data: { email: personaEmail, password: REAL_DEMO_PASSWORD },
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok()) {
      throw new Error(`Real-backend login failed for ${personaEmail}: ${res.status()} ${await res.text()}`)
    }
    return
  }
  await context.addCookies([
    {
      name: PERSONA_COOKIE,
      value: personaEmail,
      url: 'http://localhost:3000',
      sameSite: 'Lax',
    },
  ])
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await signIn(page.context(), 'drew@bulwark.demo')
}

export async function signInAsField(page: Page): Promise<void> {
  await signIn(page.context(), 'matthew@bulwark.demo')
}

export async function signInAsSuper(page: Page): Promise<void> {
  await signIn(page.context(), 'sasha@bulwark.platform')
}

export async function signInAsSub(page: Page): Promise<void> {
  await signIn(page.context(), 'jeff@bulwark.demo')
}

export async function signOut(context: BrowserContext): Promise<void> {
  if (isRealBackend()) {
    await context.request.post('http://localhost:3000/api/services/auth/logout')
    await context.clearCookies()
    return
  }
  await context.clearCookies({ name: PERSONA_COOKIE })
}

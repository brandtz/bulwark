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

export async function signIn(context: BrowserContext, personaEmail: string): Promise<void> {
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

export async function signOut(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: PERSONA_COOKIE })
}

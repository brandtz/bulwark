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
import { expect, type BrowserContext, type Page } from '@playwright/test'

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

/**
 * WP-L07 S1: cookie-authenticated unsafe API calls need the double-submit header.
 * Copy the server-issued `bulwark.csrf` cookie into the context's extra headers
 * (minting it with a GET first if the context has none yet).
 */
export async function applyCsrfHeader(context: BrowserContext): Promise<void> {
  const find = async () => (await context.cookies('http://localhost:3000')).find((c) => c.name === 'bulwark.csrf')?.value
  let token = await find()
  if (!token) {
    await context.request.get('http://localhost:3000/api/health')
    token = await find()
  }
  if (token) await context.setExtraHTTPHeaders({ 'x-csrf-token': token })
}

export async function signIn(context: BrowserContext, personaEmail: string): Promise<void> {
  if (isRealBackend()) {
    // Re-login over an existing session is an authenticated unsafe call too.
    await applyCsrfHeader(context)
    const res = await context.request.post('http://localhost:3000/api/services/auth/login', {
      data: { email: personaEmail, password: REAL_DEMO_PASSWORD },
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok()) {
      throw new Error(`Real-backend login failed for ${personaEmail}: ${res.status()} ${await res.text()}`)
    }
    await applyCsrfHeader(context)
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
    await applyCsrfHeader(context)
    await context.request.post('http://localhost:3000/api/services/auth/logout')
    await context.clearCookies()
    // A stale token header would override the one the app sends for its next session.
    await context.setExtraHTTPHeaders({})
    return
  }
  await context.clearCookies({ name: PERSONA_COOKIE })
}

/**
 * True when the suite targets a production build (`nuxt build` output) rather than `nuxt dev`.
 * Dev-only affordances (persona quick-pick, dev reset links) are compiled out of such builds.
 * Set BULWARK_E2E_BUILT=1 when reusing an already-running built server.
 */
export function isBuiltServer(): boolean {
  return !!process.env.BULWARK_E2E_SERVER_COMMAND || process.env.BULWARK_E2E_BUILT === '1'
}

/**
 * Wait until Vue has mounted/hydrated the Nuxt root. Inputs filled before
 * hydration are reset by v-model when the app mounts (WP-Q3 flake source).
 * Mount is not enough: a page with async setup hydrates inside Suspense, and its
 * event handlers attach only once that resolves, so also wait for Nuxt's
 * `isHydrating` flag to clear (a click before that is silently dropped).
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    type NuxtRoot = Element & { __vue_app__?: { config?: { globalProperties?: { $nuxt?: { isHydrating?: boolean } } } } }
    const app = (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__
    return !!app && app.config?.globalProperties?.$nuxt?.isHydrating === false
  })
}

/** Draw a stroke on the SignaturePad canvas (pointer events the pad listens to). */
export async function drawSignature(page: Page): Promise<void> {
  const canvas = page.getByTestId('signature-pad-canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signature canvas has no bounding box')
  // Use Playwright's dispatchEvent which produces real-looking pointer
  // events that the SignaturePad handlers see.
  const cx = box.x + box.width * 0.2
  const cy = box.y + box.height * 0.5
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: cx,
    clientY: cy,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
  })
  for (let i = 1; i <= 8; i += 1) {
    await canvas.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: cx + (box.width * 0.6 * i) / 8,
      clientY: cy + Math.sin(i) * 12,
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
    })
  }
  await canvas.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: cx + box.width * 0.6,
    clientY: cy,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 0,
  })
}

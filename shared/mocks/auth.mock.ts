/**
 * shared/mocks/auth.mock.ts — MockAuthService.
 *
 * Why a session ADAPTER instead of module state
 * ---------------------------------------------
 * The naive demo kept the active user in a module-level variable. That
 * appears fine until you realise Nuxt SSR runs in a different Node process
 * than the browser — a logout on the client never reached the server's
 * `active` variable, so the middleware kept thinking you were signed in.
 *
 * Decision (E2-S1): inject a SessionAdapter that the Nuxt plugin backs with
 * a cookie via `useCookie('bulwark.mock.persona')`. Both server and client
 * read the same cookie, so the mock is now consistent across the
 * SSR / hydration / client-nav lifecycle.
 *
 * Decision cast down: pass `useCookie` directly into the mock. Rejected
 * because that couples a "shared/mocks" file to Nuxt's auto-import surface,
 * making the mock harder to unit-test outside Nuxt.
 */
import type { IAuthService, AuthResult, LoginInput, SessionUser } from '../contracts/auth'
import { FIXTURE_USER_ADMIN, FIXTURE_USER_FIELD, FIXTURE_USER_SUB } from './fixtures'

export interface MockAuthSessionAdapter {
  getActivePersonaEmail(): string | null
  setActivePersonaEmail(email: string | null): void
}

const userByEmail: Record<string, SessionUser> = {
  'drew@bulwark.demo': FIXTURE_USER_ADMIN,
  'matthew@bulwark.demo': FIXTURE_USER_FIELD,
  'jeff@bulwark.demo': FIXTURE_USER_SUB,
}

function lookup(email: string | null): SessionUser | null {
  if (!email) return null
  return userByEmail[email.toLowerCase()] ?? null
}

export class MockAuthService implements IAuthService {
  constructor(private readonly adapter: MockAuthSessionAdapter) {}

  async login(input: LoginInput): Promise<AuthResult> {
    const key = input.email.toLowerCase()
    // Unknown emails fall back to the org_admin persona for demo convenience.
    // RealAuthService (E11-S2) MUST reject unknown emails.
    const u = userByEmail[key] ?? FIXTURE_USER_ADMIN
    const persistedEmail = userByEmail[key] ? key : 'drew@bulwark.demo'
    this.adapter.setActivePersonaEmail(persistedEmail)
    return { user: u }
  }

  async logout(): Promise<void> {
    this.adapter.setActivePersonaEmail(null)
  }

  async currentUser(): Promise<SessionUser | null> {
    return lookup(this.adapter.getActivePersonaEmail())
  }

  async switchActiveOrg(organizationId: string): Promise<SessionUser> {
    const u = await this.currentUser()
    if (!u) throw new Error('Not signed in')
    return { ...u, activeOrganizationId: organizationId }
  }
}


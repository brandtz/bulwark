/**
 * shared/mocks/auth.mock.ts — MockAuthService.
 *
 * The active user is stored in a module-level variable. UI calls login() and
 * we flip the variable; we don't actually validate credentials. A future
 * RealAuthService (E11-S2) will replace this with bcrypt + nuxt-auth-utils.
 */
import type { IAuthService, AuthResult, LoginInput, SessionUser } from '../contracts/auth'
import { FIXTURE_USER_ADMIN, FIXTURE_USER_FIELD, FIXTURE_USER_SUB } from './fixtures'

const userByEmail: Record<string, SessionUser> = {
  'drew@bulwark.demo': FIXTURE_USER_ADMIN,
  'matthew@bulwark.demo': FIXTURE_USER_FIELD,
  'jeff@bulwark.demo': FIXTURE_USER_SUB,
}

let active: SessionUser | null = FIXTURE_USER_ADMIN // default signed in for dev DX

export class MockAuthService implements IAuthService {
  async login(input: LoginInput): Promise<AuthResult> {
    const u = userByEmail[input.email.toLowerCase()] ?? FIXTURE_USER_ADMIN
    active = u
    return { user: u }
  }

  async logout(): Promise<void> {
    active = null
  }

  async currentUser(): Promise<SessionUser | null> {
    return active
  }

  async switchActiveOrg(organizationId: string): Promise<SessionUser> {
    if (!active) throw new Error('Not signed in')
    active = { ...active, activeOrganizationId: organizationId }
    return active
  }
}

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
import type {
  IAuthService,
  AuthResult,
  AuthLoginResult,
  AuthAttemptRow,
  GetAttemptsInput,
  LockoutState,
  LoginInput,
  SessionUser,
  RequestPasswordResetInput,
  RequestPasswordResetResult,
  ResetPasswordInput,
  AcceptInviteInput,
  InvitePreview,
} from '../contracts/auth'
import { FIXTURE_USER_ADMIN, FIXTURE_USER_FIELD, FIXTURE_USER_SUB, FIXTURE_USER_SUPER, FIXTURE_ORG_ID } from './fixtures'

export interface MockAuthSessionAdapter {
  getActivePersonaEmail(): string | null
  setActivePersonaEmail(email: string | null): void
  /**
   * E2-S4: per-session active-organization override. Null/missing means
   * "use whatever the SessionUser's `activeOrganizationId` already says".
   * Set when the user picks a different membership in the org switcher.
   */
  getActiveOrgOverride?(): string | null
  setActiveOrgOverride?(orgId: string | null): void
}

const userByEmail: Record<string, SessionUser> = {
  'drew@bulwark.demo': FIXTURE_USER_ADMIN,
  'matthew@bulwark.demo': FIXTURE_USER_FIELD,
  'jeff@bulwark.demo': FIXTURE_USER_SUB,
  'sasha@bulwark.platform': FIXTURE_USER_SUPER,
}

function lookup(email: string | null): SessionUser | null {
  if (!email) return null
  const known = userByEmail[email.toLowerCase()]
  if (known) return known
  // Unknown emails (e.g. an invite-accepted user whose record was minted
  // on the OTHER tier — server vs browser — and never replicated) get a
  // synthesized SessionUser so the cookie alone is enough to restore a
  // session across a hard navigation. This mirrors how a real backend
  // (E11) treats a signed session cookie: trust the identity, fetch the
  // profile lazily.
  const synthesized: SessionUser = {
    userId: `00000000-0000-4000-8000-${email.length.toString(16).padStart(12, '0').slice(-12)}`,
    email,
    fullName: email.split('@')[0] ?? 'New User',
    avatarUrl: null,
    activeOrganizationId: FIXTURE_ORG_ID,
    activeRole: 'org_admin',
    memberships: [
      {
        organizationId: FIXTURE_ORG_ID,
        organizationName: 'Bulwark Demo Co.',
        role: 'org_admin',
      },
    ],
  }
  userByEmail[email.toLowerCase()] = synthesized
  return synthesized
}

// ----------------------------------------------------------------------------
// Token helpers (E2-S2)
// ----------------------------------------------------------------------------
//
// Decision: encode tokens as base64url(JSON({email, kind, exp})). Stateless,
// trivial to verify on server *and* client, and survives the SSR/hydration
// boundary without needing shared storage. RealAuthService (E11-S2) replaces
// this with a signed-JWT or a `password_resets` table — same call sites.
//
// Decision cast down: store tokens in a module-level Map. Rejected because
// SSR Node and the browser run independent module instances, so a token
// minted on the server wouldn't be redeemable on the client (same trap that
// bit us with module-level `active` in E2-S1).
//
// Decision cast down: use a real JWT library. Rejected because the mock
// must stay Nuxt-free (`shared/` boundary) and we don't want to ship `jose`
// to the demo. Production swap = swap the service, not this layer.

type TokenKind = 'reset' | 'invite'
interface TokenPayload {
  email: string
  kind: TokenKind
  exp: number
  // Invite-only metadata.
  organizationId?: string
  organizationName?: string
  role?: SessionUser['activeRole']
}

function b64url(s: string): string {
  // btoa exists in Node 18+ and the browser; works in both tiers.
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
}

function mintToken(payload: TokenPayload): string {
  return b64url(JSON.stringify(payload))
}

function verifyToken(token: string, kind: TokenKind): TokenPayload {
  let p: TokenPayload
  try {
    p = JSON.parse(b64urlDecode(token)) as TokenPayload
  } catch {
    throw new Error('This link is invalid. Request a new one.')
  }
  if (p.kind !== kind) throw new Error('This link is for a different action.')
  if (typeof p.exp !== 'number' || Date.now() > p.exp) {
    throw new Error('This link has expired. Request a new one.')
  }
  return p
}

const ONE_HOUR_MS = 60 * 60 * 1000

export class MockAuthService implements IAuthService {
  constructor(private readonly adapter: MockAuthSessionAdapter) {}

  async login(input: LoginInput): Promise<AuthLoginResult> {
    const key = input.email.toLowerCase()
    // Unknown emails fall back to the org_admin persona for demo convenience.
    // RealAuthService (E11-S2) MUST reject unknown emails.
    const u = userByEmail[key] ?? FIXTURE_USER_ADMIN
    const persistedEmail = userByEmail[key] ? key : 'drew@bulwark.demo'
    this.adapter.setActivePersonaEmail(persistedEmail)
    // Reset any prior org override — fresh login starts on the user's
    // default org.
    this.adapter.setActiveOrgOverride?.(null)
    return { kind: 'session', user: u }
  }

  // Mock backend doesn't enforce MFA — the verifyMfa step just returns the
  // current session. Tests that exercise the MFA path use the real service.
  async verifyMfa(_mfaToken: string, _code: string): Promise<AuthResult> {
    const u = await this.currentUser()
    if (!u) throw new Error('Not signed in')
    return { user: u }
  }

  async getAttempts(_input: GetAttemptsInput): Promise<{ attempts: AuthAttemptRow[] }> {
    return { attempts: [] }
  }

  async getLockoutState(_input: { email: string }): Promise<LockoutState> {
    return { locked: false, until: null, attemptsRemaining: 5 }
  }

  async logout(): Promise<void> {
    this.adapter.setActivePersonaEmail(null)
    this.adapter.setActiveOrgOverride?.(null)
  }

  async currentUser(): Promise<SessionUser | null> {
    const u = lookup(this.adapter.getActivePersonaEmail())
    if (!u) return null
    // Apply the active-org override if the user picked a different
    // membership in the org switcher (E2-S4). Falls through to the user's
    // default activeOrganizationId when no override is set or when the
    // override no longer matches a membership (e.g. it was revoked).
    const override = this.adapter.getActiveOrgOverride?.() ?? null
    if (override && u.memberships.some((m) => m.organizationId === override)) {
      const m = u.memberships.find((mm) => mm.organizationId === override)!
      return { ...u, activeOrganizationId: override, activeRole: m.role }
    }
    return u
  }

  async switchActiveOrg(organizationId: string): Promise<SessionUser> {
    const u = await this.currentUser()
    if (!u) throw new Error('Not signed in')
    const m = u.memberships.find((mm) => mm.organizationId === organizationId)
    if (!m) throw new Error('You are not a member of that organization')
    this.adapter.setActiveOrgOverride?.(organizationId)
    return { ...u, activeOrganizationId: organizationId, activeRole: m.role }
  }

  /**
   * E2-S7 — synchronous tenant context resolver used by MockServiceFactory.
   * Returns null when there is no active session (cookie missing or unknown
   * email lookup yields nothing). Mirrors the async `currentUser()` logic
   * for the active-org override but stays sync so the factory can hand it
   * to domain mocks as a per-call closure.
   */
  resolveTenantSync(): { userId: string; organizationId: string } | null {
    const u = lookup(this.adapter.getActivePersonaEmail())
    if (!u) return null
    const override = this.adapter.getActiveOrgOverride?.() ?? null
    const orgId =
      override && u.memberships.some((m) => m.organizationId === override)
        ? override
        : u.activeOrganizationId
    return { userId: u.userId, organizationId: orgId }
  }

  // --- Password reset ---------------------------------------------------
  async requestPasswordReset(input: RequestPasswordResetInput): Promise<RequestPasswordResetResult> {
    const key = input.email.toLowerCase()
    // Always succeed-shape so we don't leak existence of the email.
    if (!userByEmail[key]) {
      return { devToken: null }
    }
    const token = mintToken({ email: key, kind: 'reset', exp: Date.now() + ONE_HOUR_MS })
    return { devToken: token }
  }

  async resetPassword(input: ResetPasswordInput): Promise<AuthResult> {
    const payload = verifyToken(input.token, 'reset')
    // Mock backend doesn't actually store passwords — verifying the token
    // is sufficient. Sign the user in so they don't have to re-type.
    const u = userByEmail[payload.email.toLowerCase()] ?? FIXTURE_USER_ADMIN
    this.adapter.setActivePersonaEmail(payload.email.toLowerCase())
    return { user: u }
  }

  // --- Invitations ------------------------------------------------------
  async previewInvite(token: string): Promise<InvitePreview> {
    const p = verifyToken(token, 'invite')
    return {
      email: p.email,
      organizationName: p.organizationName ?? 'Bulwark Demo Co.',
      role: p.role ?? 'field',
    }
  }

  async acceptInvite(input: AcceptInviteInput): Promise<AuthResult> {
    const p = verifyToken(input.token, 'invite')
    // For mock: synthesize a SessionUser. Real backend creates the row,
    // sends a verification email, etc.
    const role = p.role ?? 'field'
    const user: SessionUser = {
      userId: `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`,
      email: p.email,
      fullName: input.fullName,
      avatarUrl: null,
      activeOrganizationId: p.organizationId ?? FIXTURE_ORG_ID,
      activeRole: role,
      memberships: [
        {
          organizationId: p.organizationId ?? FIXTURE_ORG_ID,
          organizationName: p.organizationName ?? 'Bulwark Demo Co.',
          role,
        },
      ],
    }
    // Register in the in-memory lookup so subsequent /login works.
    userByEmail[p.email.toLowerCase()] = user
    this.adapter.setActivePersonaEmail(p.email.toLowerCase())
    return { user }
  }
}

// Convenience for /dev tooling and Playwright: mint an invite token without
// going through an admin UI. NOT exposed via IAuthService — it's a helper
// for fixtures, not part of the contract.
export function mintInviteTokenForDev(opts: {
  email: string
  organizationName?: string
  role?: SessionUser['activeRole']
  ttlMs?: number
}): string {
  return mintToken({
    email: opts.email,
    kind: 'invite',
    organizationId: FIXTURE_ORG_ID,
    organizationName: opts.organizationName ?? 'Bulwark Demo Co.',
    role: opts.role ?? 'field',
    exp: Date.now() + (opts.ttlMs ?? ONE_HOUR_MS),
  })
}

